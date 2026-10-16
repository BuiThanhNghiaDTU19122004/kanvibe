/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAttachLocalSession = vi.fn();

vi.mock("@/lib/database", () => ({
  getTaskRepository: async () => ({
    findOne: async () => ({ id: "task-1", sessionType: "terminal", sessionName: "s", sshHost: null, worktreePath: null, project: null }),
    findOneBy: async () => ({ id: "task-1", sessionType: "terminal", sessionName: "s", sshHost: null, worktreePath: null, project: null }),
  }),
}));
vi.mock("@/lib/terminal", () => ({
  attachLocalSession: (...args: unknown[]) => mockAttachLocalSession(...args),
  attachRemoteSession: vi.fn(),
  focusSession: vi.fn(),
}));
vi.mock("@/lib/sshConfig", () => ({ parseSSHConfig: vi.fn() }));
vi.mock("@/lib/remoteImagePaste", () => ({ decodeDataUrlToBuffer: vi.fn(), transferImageToRemoteHost: vi.fn() }));
vi.mock("@/lib/remoteSessionDependency", () => ({ ensureRemoteSessionDependency: vi.fn() }));
vi.mock("@/desktop/main/services/paneLayoutService", () => ({ getEffectivePaneLayout: vi.fn() }));
vi.mock("@/lib/nativeAgentRuntime", () => ({ launchNativeAgent: vi.fn() }));

interface PtyClient {
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
}

async function openClient() {
  const sent: Array<{ channel: string; payload: { data?: string } }> = [];
  const webContents = {
    id: 1,
    isDestroyed: () => false,
    send: (channel: string, payload: { data?: string }) => sent.push({ channel, payload }),
  };
  const { openTerminal } = await import("@/desktop/main/terminalBridge");
  await openTerminal(webContents as never, "task-1", null, 80, 24);
  const client = mockAttachLocalSession.mock.calls[0][4] as PtyClient;
  const dataMessages = () => sent.filter((item) => item.channel === "kanvibe:terminal-data").map((item) => item.payload.data);
  return { client, sent, dataMessages };
}

describe("terminalBridge PTY output coalescing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the first chunk after idle immediately so keystroke echo is not delayed", async () => {
    const { client, dataMessages } = await openClient();

    client.send("a");

    expect(dataMessages()).toEqual(["a"]);
  });

  it("merges chunks that arrive inside the window into one IPC message", async () => {
    const { client, dataMessages } = await openClient();

    client.send("a");
    client.send("b");
    client.send(Buffer.from("c"));
    expect(dataMessages()).toEqual(["a"]);

    vi.advanceTimersByTime(8);

    expect(dataMessages()).toEqual(["a", "bc"]);
  });

  it("flushes immediately once the pending data exceeds the size cap", async () => {
    const { client, dataMessages } = await openClient();
    const big = "x".repeat(64 * 1024);

    client.send("a");
    client.send(big);

    expect(dataMessages()).toEqual(["a", big]);
  });

  it("goes back to immediate delivery after an idle window", async () => {
    const { client, dataMessages } = await openClient();

    client.send("a");
    vi.advanceTimersByTime(8);
    client.send("b");

    expect(dataMessages()).toEqual(["a", "b"]);
  });

  it("delivers pending output before the close event", async () => {
    const { client, sent } = await openClient();

    client.send("a");
    client.send("tail");
    client.close(1000, "done");

    expect(sent.map((item) => item.channel)).toEqual([
      "kanvibe:terminal-data",
      "kanvibe:terminal-data",
      "kanvibe:terminal-close",
    ]);
    expect(sent[1].payload.data).toBe("tail");
  });
});
