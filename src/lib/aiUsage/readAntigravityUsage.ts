import { execFile } from "node:child_process";
import { createLocalShellEnvironment } from "@/lib/shellEnvironment";
import { createErrorUsage, createUnavailableUsage, createUsageResult, createUsageWindow } from "./shared";
import type { AiUsageAccount, AiUsageAccountResult, AiUsageWindow } from "./types";

export const ANTIGRAVITY_ACCOUNT: AiUsageAccount = {
  provider: "antigravity", accountId: "antigravity-default", accountRoot: "antigravity-default",
  configDir: "", label: "Antigravity",
};

/** agy owns the OS keyring. Never read or copy Gemini CLI credentials. */
export function parseAntigravityUsage(stdout: string, account = ANTIGRAVITY_ACCOUNT): AiUsageAccountResult {
  try {
    const payload = JSON.parse(stdout);
    if (payload.status !== "SUCCESS" || payload.command?.name !== "usage") {
      const message = String(payload.error || "");
      return /auth|login|sign.?in|credential/i.test(message)
        ? createUnavailableUsage(account, "missing-credentials") : createErrorUsage(account, "fetch-failed");
    }
    const windows: AiUsageWindow[] = [];
    for (const group of payload.command.data?.groups ?? []) {
      if (typeof group.name !== "string" || !Array.isArray(group.buckets)) continue;
      for (const bucket of group.buckets) {
        const fraction = bucket.remaining_fraction;
        if (typeof fraction !== "number" || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) continue;
        const kind = bucket.window === "5h" ? "session" : bucket.window === "weekly" ? "weekly" : null;
        if (!kind) continue;
        const window = createUsageWindow(kind, (1 - fraction) * 100, bucket.reset_time, group.name);
        if (window) windows.push(window);
      }
    }
    return windows.length ? createUsageResult(account, windows) : createErrorUsage(account, "empty-response");
  } catch {
    return createErrorUsage(account, "empty-response");
  }
}

// Account status and usage open together; both need the same read-only CLI result.
const pendingUsageRequests = new Map<string, Promise<AiUsageAccountResult>>();

export function readAntigravityUsage(account = ANTIGRAVITY_ACCOUNT): Promise<AiUsageAccountResult> {
  const key = JSON.stringify(account);
  const pending = pendingUsageRequests.get(key);
  if (pending) return pending;
  const request = new Promise<AiUsageAccountResult>((resolve) => {
    execFile("agy", ["-p", "/usage", "--output-format", "json"], {
      env: createLocalShellEnvironment(), windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (!error) return resolve(parseAntigravityUsage(stdout, account));
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return resolve(createUnavailableUsage(account, "antigravity-cli-not-found"));
      }
      resolve(/authentication required|not logged in|sign.?in|unauthenticated/i.test(`${stdout}\n${stderr}`)
        ? createUnavailableUsage(account, "missing-credentials") : createErrorUsage(account, "fetch-failed"));
    });
  }).finally(() => { pendingUsageRequests.delete(key); });
  pendingUsageRequests.set(key, request);
  return request;
}
