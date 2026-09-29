// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, stat } from "node:fs/promises";
import { openExternalBrowser, prepareLoginBrowser } from "../loginBrowser";

const { execFile, openExternal } = vi.hoisted(() => ({ execFile: vi.fn(), openExternal: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile }));
vi.mock("electron", () => ({ shell: { openExternal } }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetAllMocks(); });

describe("WSL login browser", () => {
  it("provides an executable BROWSER and xdg-open, then removes the temporary helper", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    const environment = { WSL_DISTRO_NAME: "Ubuntu", PATH: "/usr/bin", BROWSER: "" };
    const dispose = await prepareLoginBrowser(environment);
    try {
      expect(environment.PATH.startsWith(environment.BROWSER.replace(/\/xdg-open$/, ":"))).toBe(true);
      expect((await stat(environment.BROWSER)).mode & 0o100).toBeTruthy();
      expect(await readFile(environment.BROWSER, "utf8")).toContain("-EncodedCommand");
    } finally { await dispose(); }
    await expect(stat(environment.BROWSER)).rejects.toThrow();
  });

  it("preserves native browser behavior outside WSL", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    const environment = { PATH: "/usr/bin", BROWSER: "custom-browser" };
    await (await prepareLoginBrowser(environment))();
    expect(environment).toEqual({ PATH: "/usr/bin", BROWSER: "custom-browser" });
    await openExternalBrowser("https://example.com");
    expect(openExternal).toHaveBeenCalledWith("https://example.com");
  });

  it("passes the entire OAuth URL as data to Windows, including shell metacharacters", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    vi.stubEnv("WSL_DISTRO_NAME", "Ubuntu");
    execFile.mockImplementation((_file, _args, _options, callback) => callback(null));
    const url = "https://auth.openai.com/oauth/authorize?state=a&redirect_uri=http%3A%2F%2Flocalhost%3A1455&value='$(bad)`";
    await openExternalBrowser(url);
    const args = execFile.mock.calls[0][1];
    const command = Buffer.from(args[3], "base64").toString("utf16le");
    const payload = command.match(/FromBase64String\('([^']+)'\)/)![1];
    expect(Buffer.from(payload, "base64").toString("utf8")).toBe(url);
    expect(command).not.toContain("$(bad)");
  });

  it("rejects executable and local file links", async () => {
    await expect(openExternalBrowser("file:///tmp/script.sh")).rejects.toThrow("Unsupported");
    expect(execFile).not.toHaveBeenCalled();
  });
});
