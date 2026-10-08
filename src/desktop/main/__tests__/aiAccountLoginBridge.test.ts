// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebContents } from "electron";
import { openAiAccountLogin, closeWindowAiAccountLogins } from "../aiAccountLoginBridge";

const { spawn, prepare, dispose, auth } = vi.hoisted(() => ({ spawn: vi.fn(), prepare: vi.fn(), dispose: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/aiUsage/providerCli", async (original) => ({ ...await original<typeof import("@/lib/aiUsage/providerCli")>(), readProviderAuthStatus: auth }));
vi.mock("node-pty", () => ({ spawn }));
vi.mock("../loginBrowser", () => ({ prepareLoginBrowser: prepare }));
beforeEach(() => auth.mockResolvedValue(null));

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
      cwd: expect.any(String),
    }));
    expect(spawn.mock.calls[0][2].env.ANTIGRAVITY_CLI_HOME).not.toBe("antigravity-default");
  });

  it("reuses an authenticated Antigravity account without opening a terminal", async () => {
    auth.mockResolvedValue({ isLoggedIn: true });
    expect(await openAiAccountLogin(contents, "antigravity", "antigravity-default", 80, 24)).toEqual({ ok: true, authenticated: true });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("closes its CLI once authentication succeeds", async () => {
    vi.useFakeTimers();
    auth.mockResolvedValueOnce({ isLoggedIn: false }).mockResolvedValue({ isLoggedIn: true });
    prepare.mockResolvedValue(dispose);
    const pty = { onData: vi.fn(), onExit: vi.fn(), kill: vi.fn() };
    spawn.mockReturnValue(pty);
    await openAiAccountLogin(contents, "antigravity", "antigravity-default", 80, 24);
    await vi.advanceTimersByTimeAsync(5000);
    expect(pty.kill).toHaveBeenCalledOnce();
    expect(contents.send).toHaveBeenCalledWith("kanvibe:ai-login-exit", { accountRoot: "antigravity-default", exitCode: 0 });
    vi.useRealTimers();
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
