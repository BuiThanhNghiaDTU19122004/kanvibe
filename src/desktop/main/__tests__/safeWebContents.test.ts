import { describe, expect, it, vi } from "vitest";
import { safeSendWebContents } from "../safeWebContents";

describe("safeWebContents", () => {
  it("returns false without throwing when webContents is null or undefined", () => {
    expect(safeSendWebContents(null, "channel-a")).toBe(false);
    expect(safeSendWebContents(undefined, "channel-a")).toBe(false);
  });

  it("returns false without calling send when webContents is destroyed", () => {
    const webContents = {
      isDestroyed: vi.fn().mockReturnValue(true),
      send: vi.fn(),
    } as unknown as import("electron").WebContents;

    expect(safeSendWebContents(webContents, "channel-b", { payload: 1 })).toBe(false);
    expect(webContents.send).not.toHaveBeenCalled();
  });

  it("sends message and returns true when webContents is active", () => {
    const webContents = {
      isDestroyed: vi.fn().mockReturnValue(false),
      send: vi.fn(),
    } as unknown as import("electron").WebContents;

    expect(safeSendWebContents(webContents, "channel-c", "hello", 123)).toBe(true);
    expect(webContents.send).toHaveBeenCalledWith("channel-c", "hello", 123);
  });

  it("catches errors thrown during send and returns false without crashing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const webContents = {
      isDestroyed: vi.fn().mockReturnValue(false),
      send: vi.fn().mockImplementation(() => {
        throw new Error("Target window closed abruptly");
      }),
    } as unknown as import("electron").WebContents;

    expect(safeSendWebContents(webContents, "channel-d")).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      "[kanvibe] Failed to send IPC message on channel:",
      "channel-d",
      expect.any(Error),
    );
  });
});
