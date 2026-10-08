// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseAntigravityUsage, readAntigravityUsage } from "../readAntigravityUsage";
const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile }));

describe("Antigravity native quota", () => {
  const payload = { status: "SUCCESS", command: { name: "usage", data: { groups: [
    { name: "Gemini Models", buckets: [
      { window: "weekly", remaining_fraction: 0.83, reset_time: "2026-09-30T09:30:52Z" },
      { window: "5h", remaining_fraction: 1, reset_time: "2026-09-29T20:36:12Z" },
    ] },
    { name: "Claude and GPT models", buckets: [{ window: "weekly", remaining_fraction: 0.66 }] },
  ] } } };
  it("converts remaining quotas into usage and preserves group/window identity", () => {
    const result = parseAntigravityUsage(JSON.stringify(payload));
    expect(result.status).toBe("ok");
    expect(result.windows).toHaveLength(3);
    expect(result.windows[0].usedPercent).toBeCloseTo(17);
    expect(result.windows[1]).toMatchObject({ kind: "session", usedPercent: 0, modelName: "Gemini Models" });
    expect(result.windows[2]).toMatchObject({ kind: "weekly", modelName: "Claude and GPT models" });
  });
  it("does not interpret malformed or empty quota output as zero usage", () => {
    for (const output of ["garbage", "{}", JSON.stringify({ status: "SUCCESS", command: { name: "usage", data: { groups: [] } } })]) {
      expect(parseAntigravityUsage(output).status).toBe("error");
    }
  });
  it("uses only the read-only slash command, with a hidden bounded process", async () => {
    execFile.mockImplementation((_cmd, _args, _options, callback) => callback(null, JSON.stringify(payload), ""));
    expect((await readAntigravityUsage()).status).toBe("ok");
    expect(execFile).toHaveBeenLastCalledWith("agy", ["-p", "/usage", "--output-format", "json"],
      expect.objectContaining({ windowsHide: true, timeout: 20000 }), expect.any(Function));
  });
  it("shares the CLI process between concurrent auth and quota reads", async () => {
    execFile.mockClear();
    let finish: (error: unknown, stdout: string, stderr: string) => void = () => {};
    execFile.mockImplementation((_cmd, _args, _options, callback) => { finish = callback; });
    const first = readAntigravityUsage();
    const second = readAntigravityUsage();
    expect(first).toBe(second);
    expect(execFile).toHaveBeenCalledTimes(1);
    finish(null, JSON.stringify(payload), "");
    expect((await first).status).toBe("ok");
    expect((await second).status).toBe("ok");
    execFile.mockImplementation((_cmd, _args, _options, callback) => callback(null, JSON.stringify(payload), ""));
    await readAntigravityUsage();
    expect(execFile).toHaveBeenCalledTimes(2);
  });
  it("distinguishes missing authentication from a missing CLI", async () => {
    execFile.mockImplementation((_cmd, _args, _options, callback) => callback({ code: "ENOENT" }, "", ""));
    expect((await readAntigravityUsage()).reason).toBe("antigravity-cli-not-found");
    execFile.mockImplementation((_cmd, _args, _options, callback) => callback({ code: 1 }, "", "authentication required"));
    expect((await readAntigravityUsage()).reason).toBe("missing-credentials");
  });
});
