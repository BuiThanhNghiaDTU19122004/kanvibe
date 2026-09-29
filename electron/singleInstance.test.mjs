import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const { acquireSingleInstance } = createRequire(import.meta.url)("./singleInstance");

describe("desktop single instance", () => {
  it("exits a duplicate before starting another window or hook server", () => {
    const app = { requestSingleInstanceLock: () => false, quit: vi.fn(), on: vi.fn() };
    expect(acquireSingleInstance(app, vi.fn(), vi.fn())).toBe(false);
    expect(app.quit).toHaveBeenCalledOnce();
    expect(app.on).not.toHaveBeenCalled();
  });
  it("brings the existing window forward when launched again", async () => {
    const app = { requestSingleInstanceLock: () => true, quit: vi.fn(), on: vi.fn(), whenReady: () => Promise.resolve() };
    const window = {};
    const focus = vi.fn();
    expect(acquireSingleInstance(app, () => window, focus)).toBe(true);
    app.on.mock.calls[0][1]();
    await Promise.resolve();
    expect(focus).toHaveBeenCalledWith(window);
    expect(app.quit).not.toHaveBeenCalled();
  });
});
