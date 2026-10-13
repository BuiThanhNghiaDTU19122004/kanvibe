import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { getProjectRepository, getTaskRepository } from "@/lib/database";
import { SessionType } from "@/entities/KanbanTask";
import { attachLocalSession, attachRemoteSession, focusSession } from "@/lib/terminal";
import { parseSSHConfig, type SSHHostConfig } from "@/lib/sshConfig";
import { ensureRemoteSessionDependency } from "@/lib/remoteSessionDependency";
import { getEffectivePaneLayout } from "@/desktop/main/services/paneLayoutService";
import { decodeDataUrlToBuffer, transferImageToRemoteHost } from "@/lib/remoteImagePaste";
import { launchNativeAgent } from "@/lib/nativeAgentRuntime";
import type { AgentLaunchResult } from "@/desktop/shared/agentRuntime";
import type { AiSessionProvider } from "@/lib/aiSessions/types";
import { resolveTaskWorkingDirectory, resolveValidLocalWorkingDirectory } from "@/lib/taskWorkingDirectory";

const OPEN = 1;
const CLOSED = 3;

/** 이 시간 안에 연달아 도착한 PTY chunk는 IPC 한 건으로 합친다 */
const TERMINAL_COALESCE_WINDOW_MS = 8;
/** 합친 데이터가 이 크기를 넘으면 창이 끝나기를 기다리지 않고 바로 보낸다 */
const TERMINAL_COALESCE_MAX_CHARS = 64 * 1024;

class ElectronTerminalClient extends EventEmitter {
  readonly OPEN = OPEN;
  readyState = OPEN;
  /**
   * 동일 (webContentsId, taskId) 조합으로 openTerminal이 중첩 호출되는 횟수를 추적한다.
   * React StrictMode dev 환경에서 useEffect가 mount → cleanup → remount로 두 번 도는 경우,
   * 첫 mount의 cleanup이 두 번째 mount가 사용 중인 PTY를 죽이지 않도록 보호한다.
   */
  refCount = 1;

  constructor(
    private readonly webContents: WebContents,
    private readonly taskId: string,
    private readonly tabId: string | null,
  ) {
    super();
  }

  private pendingData = "";
  private coalesceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * PTY 출력을 IPC 한 건씩 보내지 않고 짧은 창 안에서 모아 보낸다.
   * 에이전트 TUI는 작은 chunk를 초당 수천 번 쏟아내는데, 그때마다 IPC 직렬화와 렌더러 이벤트가 생기면 둘 다 밀린다.
   * 유휴 상태의 첫 chunk는 바로 보내서 키 입력 echo 지연은 늘리지 않는다.
   */
  send(data: string | Buffer) {
    if (this.readyState !== OPEN || this.webContents.isDestroyed()) {
      return;
    }

    this.pendingData += typeof data === "string" ? data : data.toString();

    if (this.coalesceTimer === null) {
      this.flushPendingData();
      this.coalesceTimer = setTimeout(this.handleCoalesceWindowEnd, TERMINAL_COALESCE_WINDOW_MS);
      return;
    }

    if (this.pendingData.length >= TERMINAL_COALESCE_MAX_CHARS) {
      this.flushPendingData();
    }
  }

  private readonly handleCoalesceWindowEnd = () => {
    this.coalesceTimer = null;
    if (this.pendingData.length === 0) {
      return;
    }

    this.flushPendingData();
    this.coalesceTimer = setTimeout(this.handleCoalesceWindowEnd, TERMINAL_COALESCE_WINDOW_MS);
  };

  private flushPendingData() {
    if (this.pendingData.length === 0) {
      return;
    }

    const data = this.pendingData;
    this.pendingData = "";

    if (this.webContents.isDestroyed()) {
      return;
    }

    this.webContents.send("kanvibe:terminal-data", {
      taskId: this.taskId,
      tabId: this.tabId,
      data,
    });
  }

  close(_code?: number, reason?: string) {
    if (this.readyState !== OPEN) {
      return;
    }

    /** close 이벤트가 마지막 출력을 앞질러 가지 않도록 남은 데이터를 먼저 내보낸다 */
    this.flushPendingData();
    if (this.coalesceTimer !== null) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
    }

    this.readyState = CLOSED;
    this.emit("close");

    if (!this.webContents.isDestroyed()) {
      this.webContents.send("kanvibe:terminal-close", {
        taskId: this.taskId,
        tabId: this.tabId,
        reason: reason ?? null,
      });
    }
  }

  emitMessage(message: string) {
    if (this.readyState !== OPEN) {
      return;
    }

    this.emit("message", Buffer.from(message));
  }
}

const terminalClients = new Map<string, ElectronTerminalClient>();

/**
 * 렌더러는 멀티플렉서 세션에 null을, terminal 세션에 탭 식별자를 넘긴다.
 * 그래야 tmux·zellij는 창 하나가 PTY 하나를 공유하고, terminal 세션만 탭마다 스트림이 갈린다.
 */
function buildClientKey(webContentsId: number, taskId: string, tabId: string | null): string {
  return `${webContentsId}:${taskId}:${tabId ?? ""}`;
}

function getClient(
  webContentsId: number,
  taskId: string,
  tabId: string | null,
): ElectronTerminalClient | null {
  return terminalClients.get(buildClientKey(webContentsId, taskId, tabId)) ?? null;
}

/** taskId로 원격 세션 여부와 매칭되는 SSH 접속 정보를 함께 조회한다 */
async function resolveRemoteSshConfig(
  taskId: string,
): Promise<{ ok: true; sshConfig: SSHHostConfig } | { ok: false; error: string }> {
  const taskRepo = await getTaskRepository();
  const task = await taskRepo.findOneBy({ id: taskId });

  if (!task || !task.sshHost) {
    return { ok: false, error: "원격 세션이 아닙니다." };
  }

  const sshHosts = await parseSSHConfig();
  const sshConfig = sshHosts.find((host) => host.host === task.sshHost);

  if (!sshConfig) {
    return { ok: false, error: `SSH 호스트를 찾을 수 없습니다: ${task.sshHost}` };
  }

  return { ok: true, sshConfig };
}

/** 클립보드 이미지를 원격 세션에 scp로 전달하고, 성공하면 원격 경로를 반환한다 */
export async function pasteImageToRemoteTerminal(
  taskId: string,
  imageDataUrl: string,
): Promise<{ ok: true; remotePath: string } | { ok: false; error: string }> {
  const resolved = await resolveRemoteSshConfig(taskId);
  if (!resolved.ok) {
    return resolved;
  }

  try {
    const imageBuffer = decodeDataUrlToBuffer(imageDataUrl);
    const remotePath = await transferImageToRemoteHost(resolved.sshConfig, imageBuffer);
    return { ok: true, remotePath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "이미지 전송 실패" };
  }
}

export async function openTerminal(
  webContents: WebContents,
  taskId: string,
  tabId: string | null,
  cols: number,
  rows: number,
) {
  const existingClient = getClient(webContents.id, taskId, tabId);
  if (existingClient) {
    existingClient.refCount += 1;
    existingClient.emitMessage(`\x01${JSON.stringify({ type: "resize", cols, rows })}`);
    return { ok: true };
  }

  const taskRepo = await getTaskRepository();
  const task = (await taskRepo.findOne?.({
    where: { id: taskId },
    relations: ["project"],
  })) ?? (await taskRepo.findOneBy({ id: taskId }));

  if (!task || !task.sessionType || !task.sessionName) {
    return { ok: false, error: "작업에 연결된 세션이 없습니다." };
  }

  let project = task.project ?? null;
  if (!project && task.projectId) {
    try {
      const projectRepo = await getProjectRepository();
      project = await projectRepo.findOneBy({ id: task.projectId });
    } catch {
      // ignore in tests or mock repos
    }
  }

  let cwd: string | null = null;
  if (task.sshHost) {
    cwd = resolveTaskWorkingDirectory({ worktreePath: task.worktreePath, project });
  } else {
    const candidateCwd = resolveTaskWorkingDirectory({ worktreePath: task.worktreePath, project });
    if (candidateCwd) {
      const validation = resolveValidLocalWorkingDirectory({ worktreePath: task.worktreePath, project });
      if (!validation.ok) {
        return { ok: false, error: validation.error };
      }
      cwd = validation.cwd;
    } else {
      cwd = null;
    }
  }

  const client = new ElectronTerminalClient(webContents, taskId, tabId);
  terminalClients.set(buildClientKey(webContents.id, taskId, tabId), client);

  const finalizeClient = () => {
    terminalClients.delete(buildClientKey(webContents.id, taskId, tabId));
  };

  client.once("close", finalizeClient);

  try {
    const tmuxPaneLayout = task.sessionType === SessionType.TMUX
      ? await getEffectivePaneLayout(task.projectId ?? undefined)
      : null;

    if (task.sshHost) {
      await ensureRemoteSessionDependency(task.sessionType as SessionType, task.sshHost);

      const resolved = await resolveRemoteSshConfig(taskId);
      if (!resolved.ok) {
        client.close(1008, resolved.error);
        return { ok: false, error: resolved.error };
      }

      await attachRemoteSession(
        taskId,
        tabId,
        task.sshHost,
        task.sessionType as SessionType,
        task.sessionName,
        client as never,
        resolved.sshConfig,
        cols,
        rows,
        cwd,
        tmuxPaneLayout,
      );
    } else {
      await attachLocalSession(
        taskId,
        tabId,
        task.sessionType as SessionType,
        task.sessionName,
        client as never,
        cwd,
        cols,
        rows,
        tmuxPaneLayout,
      );
    }

    return { ok: true };
  } catch (error) {
    finalizeClient();
    client.close(1011, "터미널 연결 실패");
    return {
      ok: false,
      error: error instanceof Error ? error.message : "터미널 연결 실패",
    };
  }
}

export function writeTerminal(
  webContentsId: number,
  taskId: string,
  tabId: string | null,
  data: string,
) {
  getClient(webContentsId, taskId, tabId)?.emitMessage(data);
}

export async function launchAgent(webContentsId: number, taskId: string, tabId: string | null): Promise<AgentLaunchResult> {
  const client = getClient(webContentsId, taskId, tabId);
  if (!client || client.readyState !== OPEN || client.listenerCount("message") === 0) {
    return { ok: false, code: "terminal-not-ready" };
  }
  const task = await (await getTaskRepository()).findOneBy({ id: taskId });
  if (process.platform !== "win32" || task?.sshHost || task?.sessionType !== SessionType.TERMINAL) {
    return { ok: false, code: "unsupported-session" };
  }
  if (!task.agentType || !["claude", "codex", "opencode", "antigravity"].includes(task.agentType)) {
    return { ok: false, code: "launch-failed" };
  }
  return launchNativeAgent(taskId, tabId, task.agentType as AiSessionProvider, task.description ?? "");
}

export function resizeTerminal(
  webContentsId: number,
  taskId: string,
  tabId: string | null,
  cols: number,
  rows: number,
) {
  getClient(webContentsId, taskId, tabId)
    ?.emitMessage(`\x01${JSON.stringify({ type: "resize", cols, rows })}`);
}

export function focusTerminal(taskId: string) {
  focusSession(taskId);
}

export function closeTerminal(webContentsId: number, taskId: string, tabId: string | null) {
  const client = getClient(webContentsId, taskId, tabId);
  if (!client) {
    return;
  }

  client.refCount -= 1;
  if (client.refCount > 0) {
    return;
  }

  client.close();
}

/** 윈도우(webContents) 자체가 destroy되는 경로이므로 refCount와 무관하게 모든 client를 강제 정리한다 */
export function closeWindowTerminals(webContentsId: number) {
  for (const [key, client] of terminalClients.entries()) {
    if (key.startsWith(`${webContentsId}:`)) {
      client.refCount = 0;
      client.close();
    }
  }
}
