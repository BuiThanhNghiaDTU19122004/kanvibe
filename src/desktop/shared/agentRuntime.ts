import type { AiSessionProvider, RunningAgentPane } from "@/lib/aiSessions/types";

export type AgentRuntimeState = "starting" | "running" | "idle" | "unknown" | "failed";
export type AgentLaunchError = "terminal-not-ready" | "missing-cli" | "already-running" | "terminal-busy" | "unsupported-session" | "launch-failed" | "launch-unconfirmed";

export interface AgentRuntime {
  taskId: string;
  tabId: string | null;
  provider: AiSessionProvider;
  state: AgentRuntimeState;
  errorCode: AgentLaunchError | null;
  updatedAt: string;
  observedAt?: string;
}

export interface AgentMonitor {
  panes: RunningAgentPane[];
  runtimes: AgentRuntime[];
  readAt: string;
}

export type AgentLaunchResult = { ok: true } | { ok: false; code: AgentLaunchError };
