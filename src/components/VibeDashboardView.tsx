"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { TaskStatus, type KanbanTask } from "@/entities/KanbanTask";
import type { RunningAgentPane } from "@/lib/aiSessions/types";
import type { Project } from "@/entities/Project";
import type { AgentRuntime } from "@/desktop/shared/agentRuntime";
import type { TaskDiffStats } from "@/desktop/shared/taskDiffStats";
import { AiProviderIcon } from "./AiProviderIcon";
import { TaskDiffStatsBadge } from "./TaskDiffStats";

interface VibeDashboardViewProps {
  tasks: Record<TaskStatus, KanbanTask[]>;
  runningAgentPanes: RunningAgentPane[];
  projects: Project[];
  projectNameMap: Map<string, string>;
  projectColorMap: Map<string, string>;
  projectIconMap: Map<string, string | null>;
  diffStatsByTaskId?: Record<string, TaskDiffStats> | Map<string, TaskDiffStats>;
  runtimes?: AgentRuntime[];
  monitorError?: boolean;
  monitorReadAt?: string | null;
  onRetryMonitor?: () => void;
  completedTotal?: number;
  onNewTask: () => void;
  onSelectTask: (taskId: string) => void;
}

const normalizePath = (value: string) => value.replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();

export default function VibeDashboardView({ tasks, runningAgentPanes, projectNameMap,
  diffStatsByTaskId, runtimes = [], monitorError = false, monitorReadAt, onRetryMonitor,
  completedTotal, onNewTask, onSelectTask }: VibeDashboardViewProps) {
  const t = useTranslations("mvp");
  const td = useTranslations("dashboard");
  const tb = useTranslations("board");
  const allTasks = useMemo(() => Object.values(tasks).flat().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [tasks]);
  const observed = runningAgentPanes.flatMap((pane) => {
    const task = allTasks.find((item) => item.worktreePath && normalizePath(item.worktreePath) === normalizePath(pane.worktreePath));
    return task ? [{ pane, task }] : [];
  });
  const runtimeError = (taskId: string) => runtimes.find((runtime) => runtime.taskId === taskId && runtime.errorCode);
  const attention = allTasks.filter((task) => task.status !== TaskStatus.DONE && (task.status === TaskStatus.PENDING || task.status === TaskStatus.REVIEW || runtimeError(task.id)));
  const getStats = (id: string) => diffStatsByTaskId instanceof Map ? diffStatsByTaskId.get(id) : diffStatsByTaskId?.[id];
  const nextAction = (task: KanbanTask) => runtimeError(task.id) ? t("resolveError") : task.status === TaskStatus.REVIEW ? t("reviewResult") : t("respondToAgent");

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8" data-testid="vibe-dashboard-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-text-primary">{t("dashboardTitle")}</h1>
          <p className="mt-1 text-sm text-text-muted">{t("dashboardDescription")}</p></div>
        <button type="button" onClick={onNewTask} data-testid="dashboard-new-task-btn" className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-text-inverse">{tb("newTask")}</button>
      </div>

      <section className="rounded-xl border border-border-default bg-bg-surface p-5" data-testid="pending-attention-section">
        <h2 className="text-base font-semibold text-text-primary">{t("needsAttention")} <span className="ml-2 text-status-warning">{attention.length}</span></h2>
        {attention.length ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {attention.map((task) => <div key={task.id} className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-4" data-testid="attention-task-card">
            <p className="text-xs text-text-muted">{task.projectId ? projectNameMap.get(task.projectId) : ""}</p>
            <h3 className="mt-1 font-medium text-text-primary">{task.title}</h3>
            <p className="mt-2 text-sm text-text-secondary">{runtimeError(task.id) ? t(`launchErrors.${runtimeError(task.id)!.errorCode}`) : task.status === TaskStatus.REVIEW ? t("reviewHint") : t("pendingHint")}</p>
            <button type="button" onClick={() => onSelectTask(task.id)} className="mt-3 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-medium text-text-inverse">{nextAction(task)}</button>
          </div>)}
        </div> : <p className="mt-3 text-sm text-text-muted">{t("nothingNeedsAttention")}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-text-primary">{td("missionControl")}</h2>
          <span className="text-xs text-text-muted">{t("observedProcesses")}</span>
        </div>
        {monitorError ? <div role="alert" className="rounded-lg border border-status-warning/40 bg-bg-surface p-4">
          <p className="text-sm text-status-warning">{t("monitorUnavailable")}</p>
          <p className="mt-1 text-xs text-text-muted">{t("monitorUnavailableHint")}</p>
          {monitorReadAt && <p className="mt-2 text-xs text-text-muted">{t("lastChecked", { time: new Date(monitorReadAt).toLocaleTimeString() })}</p>}
          <button type="button" onClick={onRetryMonitor} className="mt-2 text-sm text-brand-primary">{t("retry")}</button>
        </div> : !monitorReadAt ? <p className="rounded-lg border border-border-default p-4 text-sm text-text-muted">{t("checkingAgents")}</p> : observed.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="active-agents-grid">
            {observed.map(({ pane, task }) => <div key={`${pane.sessionName}:${pane.windowId}`} className="rounded-xl border border-border-default bg-bg-surface p-4" data-testid="active-agent-card">
              <div className="flex items-center gap-2"><AiProviderIcon provider={pane.provider} size={20} />
                <span className="text-sm font-semibold text-text-primary">{pane.provider}</span><span className="ml-auto text-xs text-status-success">{t("processRunning")}</span></div>
              <h3 className="mt-3 font-medium text-text-primary">{task.title}</h3>
              <p className="mt-1 text-xs text-text-muted">{task.projectId ? projectNameMap.get(task.projectId) : ""}</p>
              <div className="mt-3 flex items-center justify-between gap-2"><TaskDiffStatsBadge stats={getStats(task.id)} />
                <button type="button" onClick={() => onSelectTask(task.id)} className="text-sm font-medium text-brand-primary">{t("viewActivity")} →</button></div>
            </div>)}
          </div>
        ) : <div className="rounded-xl border border-dashed border-border-default bg-bg-surface p-6" data-testid="empty-active-agents">
          <p className="text-sm text-text-primary">{td("noActiveAgents")}</p><p className="mt-1 text-xs text-text-muted">{td("startAgentPrompt")}</p>
        </div>}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary">{t("taskList")}</h2>
        <div className="overflow-hidden rounded-xl border border-border-default bg-bg-surface">
          {allTasks.length ? allTasks.slice(0, 20).map((task) => <button key={task.id} type="button" onClick={() => onSelectTask(task.id)}
            className="flex w-full items-center justify-between gap-4 border-b border-border-subtle px-4 py-3 text-left last:border-0 hover:bg-bg-page">
            <span className="min-w-0"><span className="block truncate text-sm font-medium text-text-primary">{task.title}</span>
              <span className="mt-1 block text-xs text-text-muted">{task.projectId ? projectNameMap.get(task.projectId) : ""}</span></span>
            <span className="shrink-0 text-xs text-text-secondary">{tb(`columns.${task.status}`)}</span>
          </button>) : <p className="p-5 text-sm text-text-muted">{tb("emptyBoardTitle")}</p>}
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 text-xs text-text-muted sm:grid-cols-4">
        <p>{td("activeAgents")}: <strong>{monitorError || !monitorReadAt ? "—" : observed.length}</strong></p>
        <p>{td("inProgress")}: <strong>{tasks[TaskStatus.PROGRESS].length}</strong></p>
        <p>{td("inReview")}: <strong>{tasks[TaskStatus.REVIEW].length}</strong></p>
        <p>{td("completed")}: <strong>{completedTotal ?? tasks[TaskStatus.DONE].length}</strong></p>
      </div>
    </div>
  );
}
