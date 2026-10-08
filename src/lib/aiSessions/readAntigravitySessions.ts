import { createReaderResult } from "./shared";
import type { AiSessionReaderResult, AiSessionDetailReaderResult, LiveProviderSnapshot } from "./types";

// agy quota support does not imply compatibility with another CLI's transcript format.
export async function readAntigravitySessions(..._args: unknown[]): Promise<AiSessionReaderResult> {
  return createReaderResult("antigravity", { available: false, sessionCount: 0, sessions: [],
    reason: "Antigravity transcript import is not available; account quotas are available in AI Accounts." });
}
export async function readAntigravitySessionDetail(..._args: unknown[]): Promise<AiSessionDetailReaderResult | null> {
  return null;
}
export async function readAntigravityLiveSessions(): Promise<LiveProviderSnapshot[]> { return []; }
