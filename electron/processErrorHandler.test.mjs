import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProcessErrorHandler,
  isFatalError,
  safeSendWebContents,
} from "./processErrorHandler";

describe("processErrorHandler", () => {
  let logDiagnostic;
  let killAllTerminalSessions;
  let onFatalCrash;
  let showErrorDialog;
  let exitProcess;
  let writeClipboard;
  let notifyRendererError;
  let consoleError;

  beforeEach(() => {
    logDiagnostic = vi.fn();
    killAllTerminalSessions = vi.fn();
    onFatalCrash = vi.fn();
    showErrorDialog = vi.fn().mockReturnValue(0);
    exitProcess = vi.fn();
    writeClipboard = vi.fn();
    notifyRendererError = vi.fn();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  function createHandler(options = {}) {
    return createProcessErrorHandler({
      logDiagnostic,
      killAllTerminalSessions: () => killAllTerminalSessions,
      onFatalCrash,
      showErrorDialog,
      exitProcess,
      writeClipboard,
      notifyRendererError,
      getLogPath: () => "/path/to/kanvibe-desktop.log",
      crashLoopThreshold: 5,
      crashLoopWindowMs: 2000,
      ...options,
    });
  }

  it("does not exit process on a non-fatal uncaughtException", () => {
    const handler = createHandler();
    const error = new Error("non-fatal error in service");

    handler.handleUncaughtException(error);

    expect(logDiagnostic).toHaveBeenCalledWith(
      "main:uncaught-exception",
      expect.objectContaining({ error: expect.stringContaining("non-fatal error in service") }),
    );
    expect(consoleError).toHaveBeenCalled();
    expect(exitProcess).not.toHaveBeenCalled();
    expect(killAllTerminalSessions).not.toHaveBeenCalled();
    expect(notifyRendererError).toHaveBeenCalledWith("uncaughtException", {
      message: "non-fatal error in service",
      name: "Error",
    });
  });

  it("does not exit process on a non-fatal unhandledRejection", () => {
    const handler = createHandler();
    const reason = new Error("unhandled promise drop");

    handler.handleUnhandledRejection(reason);

    expect(logDiagnostic).toHaveBeenCalledWith(
      "main:unhandled-rejection",
      expect.objectContaining({ reason: expect.stringContaining("unhandled promise drop") }),
    );
    expect(consoleError).toHaveBeenCalled();
    expect(exitProcess).not.toHaveBeenCalled();
    expect(killAllTerminalSessions).not.toHaveBeenCalled();
    expect(notifyRendererError).toHaveBeenCalledWith("unhandledRejection", {
      message: "unhandled promise drop",
      name: "Error",
    });
  });

  it("triggers graceful shutdown and kills all terminals when a crash loop is detected", () => {
    let fakeNow = 1000;
    const handler = createHandler({
      now: () => fakeNow,
      crashLoopThreshold: 3,
      crashLoopWindowMs: 1000,
    });

    // Error 1
    handler.handleUncaughtException(new Error("err1"));
    expect(exitProcess).not.toHaveBeenCalled();
    expect(killAllTerminalSessions).not.toHaveBeenCalled();

    // Error 2
    handler.handleUncaughtException(new Error("err2"));
    expect(exitProcess).not.toHaveBeenCalled();
    expect(killAllTerminalSessions).not.toHaveBeenCalled();

    // Error 3 -> triggers crash loop threshold
    handler.handleUncaughtException(new Error("err3"));
    expect(killAllTerminalSessions).toHaveBeenCalledOnce();
    expect(onFatalCrash).toHaveBeenCalledOnce();
    expect(showErrorDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "KanVibe - Fatal Error",
        detail: expect.stringContaining("/path/to/kanvibe-desktop.log"),
      }),
    );
    expect(exitProcess).toHaveBeenCalledWith(1);
  });

  it("resets error count when errors occur outside the crash loop window", () => {
    let fakeNow = 1000;
    const handler = createHandler({
      now: () => fakeNow,
      crashLoopThreshold: 3,
      crashLoopWindowMs: 1000,
    });

    handler.handleUncaughtException(new Error("err1"));
    handler.handleUncaughtException(new Error("err2"));

    // Advance time past the 1000ms window
    fakeNow = 3000;
    handler.handleUncaughtException(new Error("err3"));

    // Should NOT trigger crash because time window expired
    expect(exitProcess).not.toHaveBeenCalled();
    expect(killAllTerminalSessions).not.toHaveBeenCalled();
  });

  it("immediately treats out-of-memory errors as fatal and cleans up", () => {
    const handler = createHandler();
    const oomError = new Error("JavaScript heap out of memory");
    oomError.code = "ERR_OUT_OF_MEMORY";

    handler.handleUncaughtException(oomError);

    expect(killAllTerminalSessions).toHaveBeenCalledOnce();
    expect(onFatalCrash).toHaveBeenCalledOnce();
    expect(showErrorDialog).toHaveBeenCalledOnce();
    expect(exitProcess).toHaveBeenCalledWith(1);
  });

  it("copies error to clipboard when user selects 'Copy Error & Exit'", () => {
    showErrorDialog.mockReturnValue(1); // User clicked index 1: "Copy Error & Exit"
    const handler = createHandler();

    const fatalError = new Error("fatal system crash");
    fatalError.isFatal = true;
    handler.handleUncaughtException(fatalError);

    expect(writeClipboard).toHaveBeenCalledWith(
      expect.stringContaining("fatal system crash"),
    );
    expect(exitProcess).toHaveBeenCalledWith(1);
  });

  it("guards against re-entrant shutdown if multiple fatal errors occur simultaneously", () => {
    const handler = createHandler();
    const fatal1 = new Error("fatal 1");
    fatal1.isFatal = true;
    const fatal2 = new Error("fatal 2");
    fatal2.isFatal = true;

    handler.handleUncaughtException(fatal1);
    handler.handleUncaughtException(fatal2);

    expect(killAllTerminalSessions).toHaveBeenCalledOnce();
    expect(exitProcess).toHaveBeenCalledOnce();
  });

  describe("safeIpcListener", () => {
    it("catches synchronous exceptions in IPC listeners and passes them to handleUncaughtException", () => {
      const handler = createHandler();
      const faultyListener = handler.safeIpcListener(() => {
        throw new Error("sync IPC explosion");
      });

      expect(() => faultyListener({}, "arg1")).not.toThrow();
      expect(logDiagnostic).toHaveBeenCalledWith(
        "main:uncaught-exception",
        expect.objectContaining({ error: expect.stringContaining("sync IPC explosion") }),
      );
      expect(exitProcess).not.toHaveBeenCalled();
    });

    it("catches asynchronous rejections in IPC listeners and passes them to handleUnhandledRejection", async () => {
      const handler = createHandler();
      const faultyAsyncListener = handler.safeIpcListener(async () => {
        throw new Error("async IPC failure");
      });

      await faultyAsyncListener({}, "arg1");
      expect(logDiagnostic).toHaveBeenCalledWith(
        "main:unhandled-rejection",
        expect.objectContaining({ reason: expect.stringContaining("async IPC failure") }),
      );
      expect(exitProcess).not.toHaveBeenCalled();
    });
  });

  describe("safeSendWebContents", () => {
    it("returns false without calling send if target is null or undefined", () => {
      expect(safeSendWebContents(null, "test-ch")).toBe(false);
      expect(safeSendWebContents(undefined, "test-ch")).toBe(false);
    });

    it("returns false without calling send if webContents isDestroyed returns true", () => {
      const mockWc = {
        isDestroyed: vi.fn().mockReturnValue(true),
        send: vi.fn(),
      };
      expect(safeSendWebContents(mockWc, "test-ch", { data: 123 })).toBe(false);
      expect(mockWc.send).not.toHaveBeenCalled();
    });

    it("sends message and returns true if webContents is valid and not destroyed", () => {
      const mockWc = {
        isDestroyed: vi.fn().mockReturnValue(false),
        send: vi.fn(),
      };
      expect(safeSendWebContents(mockWc, "test-ch", { data: 123 })).toBe(true);
      expect(mockWc.send).toHaveBeenCalledWith("test-ch", { data: 123 });
    });

    it("supports BrowserWindow target with nested webContents", () => {
      const mockWindow = {
        webContents: {
          isDestroyed: vi.fn().mockReturnValue(false),
          send: vi.fn(),
        },
      };
      expect(safeSendWebContents(mockWindow, "test-ch", "payload")).toBe(true);
      expect(mockWindow.webContents.send).toHaveBeenCalledWith("test-ch", "payload");
    });

    it("catches exceptions thrown by webContents.send and returns false without re-throwing", () => {
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const mockWc = {
        isDestroyed: vi.fn().mockReturnValue(false),
        send: vi.fn().mockImplementation(() => {
          throw new Error("IPC pipe broken");
        }),
      };

      expect(safeSendWebContents(mockWc, "test-ch")).toBe(false);
      expect(consoleWarn).toHaveBeenCalled();
    });
  });

  describe("isFatalError", () => {
    it("identifies OOM errors", () => {
      const state = { errorCount: 0, lastWindowStart: 0 };
      expect(isFatalError({ code: "ERR_OUT_OF_MEMORY" }, state)).toBe(true);
      expect(isFatalError({ message: "JavaScript heap out of memory" }, state)).toBe(true);
    });

    it("identifies explicitly marked fatal errors", () => {
      const state = { errorCount: 0, lastWindowStart: 0 };
      expect(isFatalError({ isFatal: true }, state)).toBe(true);
    });

    it("returns false for regular error on first occurrence", () => {
      const state = { errorCount: 0, lastWindowStart: 0 };
      expect(isFatalError(new Error("regular"), state)).toBe(false);
    });
  });
});
