import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getNativeTerminalSnapshots, writeNativeTerminal } from "@/lib/terminal";
import { createLocalShellEnvironment } from "@/lib/shellEnvironment";
import type { AgentLaunchResult, AgentMonitor, AgentRuntime } from "@/desktop/shared/agentRuntime";
import type { AiSessionProvider } from "@/lib/aiSessions/types";
import { WINDOWS_PROCESS_QUERY } from "@/lib/windowsProcessQuery";

import { buildWindowsAgentCommand } from "@/lib/windowsAgentCommand";
export { buildWindowsAgentCommand } from "@/lib/windowsAgentCommand";

const execFileAsync = promisify(execFile);
const CLI_NAMES: Record<AiSessionProvider, string> = { claude: "claude", codex: "codex", opencode: "opencode", antigravity: "agy" };
const launches = new Map<string, AgentRuntime>();
const startedAt = new Map<string, number>();
const START_TIMEOUT_MS = 20_000;

export interface WindowsProcess { ProcessId: number; ParentProcessId: number; Name: string; CommandLine?: string | null }

export function findDescendantProcesses(processes: WindowsProcess[], parentPid: number): WindowsProcess[] {
  const descendants: WindowsProcess[] = [];
  const visited = new Set([parentPid]);
  let parents = [parentPid];
  while (parents.length) {
    const children = processes.filter((item) => parents.includes(item.ParentProcessId) && !visited.has(item.ProcessId));
    children.forEach((item) => visited.add(item.ProcessId));
    descendants.push(...children);
    parents = children.map((item) => item.ProcessId);
  }
  return descendants;
}

export function identifyAgentProcess(item: WindowsProcess): AiSessionProvider | null {
  const name = item.Name.toLowerCase().replace(/\.exe$/, "");
  if (name === "claude" || name === "codex" || name === "opencode") return name;
  if (name === "agy" || name === "antigravity") return "antigravity";
  // npm CLIs run as node.exe. Match their executable/module path, not words in the prompt.
  if (name !== "node") return null;
  const command = item.CommandLine ?? "";
  if (/[/\\]@anthropic-ai[/\\]claude-code[/\\]/i.test(command)) return "claude";
  if (/[/\\]@openai[/\\]codex[/\\]/i.test(command)) return "codex";
  if (/[/\\]opencode(?:-ai)?[/\\]/i.test(command)) return "opencode";
  if (/[/\\]@google[/\\]antigravity[/\\]/i.test(command)) return "antigravity";
  return null;
}


async function readProcesses(): Promise<WindowsProcess[]> {
  const options = { windowsHide: true, timeout: 8_000, maxBuffer: 8 * 1024 * 1024, env: createLocalShellEnvironment() };
  const result = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8; @(Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId,ParentProcessId,Name,CommandLine) | ConvertTo-Json -Compress"],
  options).catch(() => execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_PROCESS_QUERY], options));
  const parsed: WindowsProcess[] | WindowsProcess = JSON.parse(result.stdout.trim() || "[]");
  return Array.isArray(parsed) ? parsed : [parsed];
}

let monitorRead: Promise<AgentMonitor> | null = null;
export function readNativeAgentMonitor(): Promise<AgentMonitor> {
  if (!monitorRead) monitorRead = readMonitor().finally(() => { monitorRead = null; });
  return monitorRead;
}

async function readMonitor(): Promise<AgentMonitor> {
  const terminals = getNativeTerminalSnapshots();
  const readAt = new Date().toISOString();
  const processes = terminals.length ? await readProcesses() : [];
  const panes: AgentMonitor["panes"] = [];
  for (const terminal of terminals) {
    const descendants = findDescendantProcesses(processes, terminal.pid);
    // One native terminal hosts one top-level CLI. Nested subagents are represented by its log graph.
    const provider = descendants.map(identifyAgentProcess).find((value) => value !== null);
    const key = `${terminal.taskId}:${terminal.tabId ?? ""}`;
    const record = launches.get(key);
    if (provider) {
      panes.push({ provider, worktreePath: terminal.worktreePath, sessionName: terminal.sessionName,
        windowId: terminal.tabId ?? "", windowName: terminal.windowName });
      launches.set(key, { taskId: terminal.taskId, tabId: terminal.tabId, provider,
        state: "running", errorCode: null, updatedAt: readAt, observedAt: record?.observedAt ?? readAt });
    } else if (record?.state === "running") {
      launches.set(key, { ...record, state: "idle", updatedAt: readAt });
    } else if (record?.state === "starting" && Date.now() - (startedAt.get(key) ?? 0) > START_TIMEOUT_MS) {
      launches.set(key, { ...record, state: "unknown", errorCode: "launch-unconfirmed", updatedAt: readAt });
    }
  }
  for (const [key, record] of launches) {
    if ((record.state === "starting" || record.state === "running") && !terminals.some((item) => `${item.taskId}:${item.tabId ?? ""}` === key)) {
      launches.set(key, { ...record, state: "idle", updatedAt: readAt });
    }
  }
  return { panes, runtimes: [...launches.values()], readAt };
}

export async function launchNativeAgent(taskId: string, tabId: string | null, provider: AiSessionProvider, prompt: string): Promise<AgentLaunchResult> {
  const key = `${taskId}:${tabId ?? ""}`;
  if (launches.get(key)?.state === "starting") return { ok: false, code: "already-running" };
  const terminal = getNativeTerminalSnapshots().find((item) => item.taskId === taskId && item.tabId === tabId);
  if (!terminal) return { ok: false, code: "terminal-not-ready" };
  const record: AgentRuntime = { taskId, tabId, provider, state: "starting", errorCode: null, updatedAt: new Date().toISOString() };
  launches.set(key, record);
  startedAt.set(key, Date.now());
  try {
    const descendants = findDescendantProcesses(await readProcesses(), terminal.pid);
    if (descendants.some((item) => identifyAgentProcess(item))) {
      launches.set(key, { ...record, state: "running" });
      return { ok: false, code: "already-running" };
    }
    if (descendants.some((item) => !/^(conhost|openconsole|winpty-agent)\.exe$/i.test(item.Name))) {
      launches.set(key, { ...record, state: "idle" });
      return { ok: false, code: "terminal-busy" };
    }
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `if (Get-Command '${CLI_NAMES[provider]}' -CommandType Application,ExternalScript -ErrorAction SilentlyContinue) { 'ready' }`],
    { windowsHide: true, timeout: 5_000, env: createLocalShellEnvironment() });
    if (!stdout.includes("ready")) {
      launches.set(key, { ...record, state: "failed", errorCode: "missing-cli" });
      return { ok: false, code: "missing-cli" };
    }
    if (!writeNativeTerminal(taskId, tabId, buildWindowsAgentCommand(provider, prompt))) {
      launches.set(key, { ...record, state: "failed", errorCode: "terminal-not-ready" });
      return { ok: false, code: "terminal-not-ready" };
    }
    return { ok: true };
  } catch {
    launches.set(key, { ...record, state: "failed", errorCode: "launch-failed" });
    return { ok: false, code: "launch-failed" };
  }
}
