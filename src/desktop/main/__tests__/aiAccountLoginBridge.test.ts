// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebContents } from "electron";
import { openAiAccountLogin, closeWindowAiAccountLogins } from "../aiAccountLoginBridge";

const { spawn, prepare, dispose } = vi.hoisted(() => ({ spawn: vi.fn(), prepare: vi.fn(), dispose: vi.fn() }));
vi.mock("node-pty", () => ({ spawn }));
vi.mock("../loginBrowser", () => ({ prepareLoginBrowser: prepare }));
afterEach(() => { closeWindowAiAccountLogins(42); vi.resetAllMocks(); });

describe("CLI login sessions", () => {
  const contents = { id: 42, isDestroyed: () => false, send: vi.fn() } as unknown as WebContents;
  it("prepares the browser before spawning Codex with the selected account", async () => {
    prepare.mockImplementation(async (env) => { env.BROWSER = "/tmp/opener"; return dispose; });
    const pty = { onData: vi.fn(), onExit: vi.fn(), kill: vi.fn() };
    spawn.mockReturnValue(pty);
    expect(await openAiAccountLogin(contents, "codex", "/tmp/codex-work", 80, 24)).toEqual({ ok: true });
    expect(spawn).toHaveBeenCalledWith("codex", ["login"], expect.objectContaining({
      env: expect.objectContaining({ CODEX_HOME: "/tmp/codex-work", BROWSER: "/tmp/opener" }),
    }));
    closeWindowAiAccountLogins(42);
    expect(pty.kill).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("launches Antigravity using its own default account store", async () => {
    prepare.mockResolvedValue(dispose);
    spawn.mockReturnValue({ onData: vi.fn(), onExit: vi.fn(), kill: vi.fn() });
    await openAiAccountLogin(contents, "antigravity", "antigravity-default", 80, 24);
    expect(spawn).toHaveBeenCalledWith("agy", [], expect.objectContaining({
      cwd: process.env.HOME,
    }));
    expect(spawn.mock.calls[0][2].env.GEMINI_CLI_HOME).not.toBe("antigravity-default");
  });

  it("cleans up and returns a useful error when the CLI is missing", async () => {
    prepare.mockResolvedValue(dispose);
    spawn.mockImplementation(() => { throw new Error("ENOENT"); });
    const result = await openAiAccountLogin(contents, "codex", "/tmp/codex-work", 80, 24);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Install it in the same environment as KanVibe");
    expect(dispose).toHaveBeenCalledOnce();
  });
});
