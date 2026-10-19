import type { WebContents } from "electron";

/**
 * Safely send an IPC message to a WebContents instance with an isDestroyed guard
 * and try-catch error boundary so an IPC pipe exception cannot crash the process.
 */
export function safeSendWebContents(
  webContents: WebContents | null | undefined,
  channel: string,
  ...args: unknown[]
): boolean {
  if (!webContents || typeof webContents.isDestroyed !== "function" || webContents.isDestroyed()) {
    return false;
  }

  try {
    webContents.send(channel, ...args);
    return true;
  } catch (error) {
    console.warn("[kanvibe] Failed to send IPC message on channel:", channel, error);
    return false;
  }
}
