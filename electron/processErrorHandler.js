/* eslint-disable @typescript-eslint/no-require-imports */

const { serializeErrorForLog } = require("./diagnostics");

const DEFAULT_CRASH_LOOP_THRESHOLD = 5;
const DEFAULT_CRASH_LOOP_WINDOW_MS = 2000;

function isFatalError(error, state, options = {}) {
  if (!error) return false;

  if (error.code === "ERR_OUT_OF_MEMORY" || (typeof error.message === "string" && error.message.includes("JavaScript heap out of memory"))) {
    return true;
  }

  if (error.isFatal === true) {
    return true;
  }

  const now = (options.now || Date.now)();
  const threshold = options.crashLoopThreshold || DEFAULT_CRASH_LOOP_THRESHOLD;
  const windowMs = options.crashLoopWindowMs || DEFAULT_CRASH_LOOP_WINDOW_MS;

  if (now - state.lastWindowStart > windowMs) {
    state.lastWindowStart = now;
    state.errorCount = 1;
    return false;
  }

  state.errorCount += 1;
  return state.errorCount >= threshold;
}

function safeSendWebContents(target, channel, ...args) {
  try {
    if (!target) return false;
    const wc = target.webContents ?? target;
    if (!wc || typeof wc.isDestroyed !== "function" || wc.isDestroyed()) {
      return false;
    }
    wc.send(channel, ...args);
    return true;
  } catch (error) {
    console.warn(`[kanvibe] Failed to send on IPC channel "${channel}":`, error);
    return false;
  }
}

function createProcessErrorHandler(options = {}) {
  const logDiagnostic = options.logDiagnostic || (() => {});
  const serializeError = options.serializeErrorForLog || serializeErrorForLog;
  const getKillAllTerminalSessions = typeof options.killAllTerminalSessions === "function"
    ? options.killAllTerminalSessions
    : () => null;
  const onFatalCrash = options.onFatalCrash || null;
  const showErrorDialog = options.showErrorDialog || null;
  const exitProcess = options.exitProcess || ((code) => process.exit(code));
  const getLogPath = options.getLogPath || (() => null);
  const writeClipboard = options.writeClipboard || null;
  const notifyRendererError = options.notifyRendererError || null;

  const state = {
    errorCount: 0,
    lastWindowStart: 0,
    isCrashing: false,
  };

  function performGracefulShutdown(type, error) {
    if (state.isCrashing) {
      return;
    }
    state.isCrashing = true;

    // 1. Dọn dẹp PTY terminal để không bị orphan / zombie process
    try {
      const killer = getKillAllTerminalSessions();
      if (typeof killer === "function") {
        killer();
      }
    } catch (cleanupError) {
      console.error("[kanvibe] Failed to cleanup terminal sessions on fatal crash:", cleanupError);
    }

    // 2. Dọn dẹp các service khác (hookServer, backgroundTaskSync...)
    try {
      onFatalCrash?.({ type, error });
    } catch (hookError) {
      console.error("[kanvibe] Failed during onFatalCrash callback:", hookError);
    }

    // 3. Hiển thị thông báo cho người dùng
    const serialized = serializeError(error);
    const logPath = getLogPath();
    const detailMessage = [
      serialized,
      "",
      "Running terminal sessions and agents have been safely terminated to prevent corruption.",
      logPath ? `Diagnostics log: ${logPath}` : null,
    ].filter(Boolean).join("\n");

    if (typeof showErrorDialog === "function") {
      try {
        const buttonIndex = showErrorDialog({
          type: "error",
          title: "KanVibe - Fatal Error",
          message: "An unrecoverable fatal error occurred in the KanVibe main process.",
          detail: detailMessage,
          buttons: ["Exit", "Copy Error & Exit"],
          defaultId: 0,
          noLink: true,
        });

        if (buttonIndex === 1 && typeof writeClipboard === "function") {
          try {
            writeClipboard(detailMessage);
          } catch (clipError) {
            console.error("[kanvibe] Failed to copy error to clipboard:", clipError);
          }
        }
      } catch (dialogError) {
        console.error("[kanvibe] Failed to display crash dialog:", dialogError);
      }
    }

    // 4. Thoát tiến trình
    exitProcess(1);
  }

  function handleUncaughtException(error) {
    const serialized = serializeError(error);
    logDiagnostic("main:uncaught-exception", { error: serialized });
    console.error("[kanvibe] uncaught exception:", error);

    if (isFatalError(error, state, options)) {
      performGracefulShutdown("uncaughtException", error);
      return;
    }

    // Lỗi không nghiêm trọng: giữ terminal/agent tiếp tục chạy, thông báo UI nếu có
    if (typeof notifyRendererError === "function") {
      try {
        notifyRendererError("uncaughtException", {
          message: error?.message || String(error),
          name: error?.name || "Error",
        });
      } catch {
        // ignore notification error
      }
    }
  }

  function handleUnhandledRejection(reason) {
    const serialized = serializeError(reason);
    logDiagnostic("main:unhandled-rejection", { reason: serialized });
    console.error("[kanvibe] unhandled rejection:", reason);

    const error = reason instanceof Error ? reason : new Error(String(reason));
    if (isFatalError(error, state, options)) {
      performGracefulShutdown("unhandledRejection", error);
      return;
    }

    if (typeof notifyRendererError === "function") {
      try {
        notifyRendererError("unhandledRejection", {
          message: error?.message || String(reason),
          name: error?.name || "UnhandledRejection",
        });
      } catch {
        // ignore notification error
      }
    }
  }

  function safeIpcListener(listener) {
    return (event, ...args) => {
      try {
        const result = listener(event, ...args);
        if (result && typeof result.catch === "function") {
          return result.catch((error) => {
            handleUnhandledRejection(error);
          });
        }
        return result;
      } catch (error) {
        handleUncaughtException(error);
      }
    };
  }

  return {
    state,
    handleUncaughtException,
    handleUnhandledRejection,
    performGracefulShutdown,
    safeIpcListener,
  };
}

module.exports = {
  DEFAULT_CRASH_LOOP_THRESHOLD,
  DEFAULT_CRASH_LOOP_WINDOW_MS,
  createProcessErrorHandler,
  isFatalError,
  safeSendWebContents,
};
