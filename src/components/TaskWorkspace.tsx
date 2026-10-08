import { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/desktop/renderer/navigation";
import { getTaskAiSessions, getTaskAiSessionDetail, getTaskLiveAiSessions, getTaskAgentCallGraph } from "@/desktop/renderer/actions/project";
import { getGitDiffFiles } from "@/desktop/renderer/actions/diff";
import { usePolledResource } from "@/desktop/renderer/hooks/usePolledValue";
import { AiSessionMessageContent } from "@/desktop/renderer/components/AiSessionMessageContent";
import { AgentCallGraphPanel } from "@/desktop/renderer/components/AgentCallGraphPanel";
import { LiveAiSessionPanel } from "@/desktop/renderer/components/LiveAiSessionPanel";
import type { KanbanTask } from "@/entities/KanbanTask";
import type { AggregatedAiMessage, AiSessionSourceStatus, AgentCallGraph, LiveAiSession } from "@/lib/aiSessions/types";
import type { DiffFile } from "@/desktop/renderer/actions/diff";
import LoadError from "./LoadError";

interface WorkspaceData {
  messages: AggregatedAiMessage[];
  sources: AiSessionSourceStatus[];
  live: LiveAiSession[];
  files: DiffFile[];
  provider: string | null;
}
const EMPTY: WorkspaceData = { messages: [], sources: [], live: [], files: [], provider: null };

export default function TaskWorkspace({ task, view, onOpenTerminal, onContinue, onDone }: {
  task: KanbanTask; view: "activity" | "results"; onOpenTerminal: () => void;
  onContinue: () => void; onDone: () => void;
}) {
  const t = useTranslations("mvp");
  const tr = useTranslations("taskDetail.aiSessions.roles");
  const locale = useLocale();
  const [graphSession, setGraphSession] = useState<LiveAiSession | null>(null);
  const read = useCallback(async (): Promise<WorkspaceData> => {
    const [history, live, files] = await Promise.all([
      getTaskAiSessions(task.id, undefined, null, 20), getTaskLiveAiSessions(task.id),
      task.branchName && task.worktreePath ? getGitDiffFiles(task.id, true) : Promise.resolve([]),
    ]);
    const session = task.agentType ? history.sessions.find((item) => item.provider === task.agentType) : history.sessions[0];
    const detail = session ? await getTaskAiSessionDetail(task.id, session.provider, session.id, session.sourceRef, null, 80) : null;
    return { messages: [...(detail?.messages ?? [])].reverse(), sources: history.sources, live: live.sessions, files, provider: session?.provider ?? null };
  }, [task.id, task.agentType, task.branchName, task.worktreePath]);
  const data = usePolledResource(read, EMPTY, 5_000, true);
  const readGraph = useCallback(() => graphSession?.sessionId
    ? getTaskAgentCallGraph(task.id, graphSession.provider, graphSession.sessionId) : Promise.resolve(null), [task.id, graphSession]);
  const graph = usePolledResource<AgentCallGraph | null>(readGraph, null, 10_000, !!graphSession);
  const selectedSource = data.value.sources.find((source) => source.provider === task.agentType);
  const unavailable = selectedSource?.available === false;
  const finalAnswer = [...data.value.messages].reverse().find((message) => message.role === "assistant");

  return (
    <div className="flex-1 overflow-y-auto bg-bg-page px-4 py-5 sm:px-7" data-testid="task-workspace">
      <div className="mx-auto max-w-4xl space-y-5">
        {data.error && <LoadError inline onRetry={data.retry} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text-primary">{view === "activity" ? t("activity") : t("results")}</h2>
          <span className="text-xs text-text-muted">{data.updatedAt ? t("lastChecked", { time: new Date(data.updatedAt).toLocaleTimeString(locale) }) : t("loadingActivity")}</span>
        </div>
        {unavailable && <p role="status" className="rounded-lg border border-status-warning/40 p-4 text-sm text-status-warning">{t("historyUnavailable", { provider: task.agentType ?? "AI" })}</p>}
        {view === "activity" ? <>
          <section className="rounded-xl border border-border-default bg-bg-surface p-4">
            <h3 className="text-sm font-semibold text-text-primary">{t("yourRequest")}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">{task.description || task.title}</p>
          </section>
          <section className="space-y-3" aria-label={t("activity")}>
            {!data.value.messages.length && <div className="rounded-xl border border-dashed border-border-default p-5">
              <p className="text-sm text-text-muted">{data.updatedAt ? t("noActivityYet") : t("loadingActivity")}</p>
              <button type="button" onClick={onOpenTerminal} className="mt-3 text-sm text-brand-primary">{t("openTerminal")}</button>
            </div>}
            {data.value.messages.slice(-30).map((message, index) => <article key={`${message.timestamp}:${index}`} className="rounded-xl border border-border-default bg-bg-surface p-4">
              <div className="mb-3 flex items-center gap-2 text-xs text-text-muted"><strong className="text-text-primary">{tr(message.role)}</strong>
                {data.value.provider && <span>{data.value.provider}</span>}
                {message.timestamp && <time className="ml-auto" dateTime={message.timestamp}>{new Date(message.timestamp).toLocaleTimeString(locale)}</time>}
              </div>
              <div className="text-sm text-text-secondary"><AiSessionMessageContent text={message.text} isUserMessage={message.role === "user"} /></div>
            </article>)}
          </section>
          <details className="rounded-xl border border-border-default bg-bg-surface p-4">
            <summary className="cursor-pointer text-sm font-medium text-text-primary">{t("agentTree")}</summary>
            <p className="mt-2 mb-3 text-xs text-text-muted">{t("agentTreeHint")}</p>
            {graph.error ? <LoadError inline onRetry={graph.retry} /> : graphSession ? <AgentCallGraphPanel session={graphSession} graph={graph.value} onBack={() => setGraphSession(null)} /> :
              <LiveAiSessionPanel sessions={data.value.live} onOpenGraph={setGraphSession} />}
          </details>
        </> : <>
          <p className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-4 text-sm text-text-secondary">{t("reviewHint")}</p>
          <section className="rounded-xl border border-border-default bg-bg-surface p-5">
            <h3 className="mb-3 font-semibold text-text-primary">{t("lastResponse")}</h3>
            {finalAnswer ? <AiSessionMessageContent text={finalAnswer.fullText || finalAnswer.text} isUserMessage={false} /> : <p className="text-sm text-text-muted">{t(data.updatedAt ? "noResponse" : "loadingActivity")}</p>}
          </section>
          <section className="rounded-xl border border-border-default bg-bg-surface p-5">
            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-text-primary">{t("changedFiles")}</h3>
              {task.branchName && task.worktreePath && <Link href={`/task/${task.id}/diff`} className="text-sm text-brand-primary">{t("viewDiff")}</Link>}</div>
            {data.value.files.length ? <ul className="mt-3 space-y-2">{data.value.files.map((file) => <li key={file.path} className="truncate font-mono text-xs text-text-secondary">{file.path}</li>)}</ul> :
              <p className="mt-3 text-sm text-text-muted">{t(data.error ? "filesUnavailable" : data.updatedAt ? "noChangedFiles" : "loadingActivity")}</p>}
          </section>
          <section className="rounded-xl border border-border-default bg-bg-surface p-5"><h3 className="font-semibold text-text-primary">{t("checks")}</h3>
            <p className="mt-2 text-sm text-text-muted">{t("checksUnknown")}</p></section>
          {task.prUrl && <a href={task.prUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-brand-primary">{t("openPr")} →</a>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={onContinue} className="rounded-lg border border-border-default px-4 py-2 text-sm text-text-primary">{t("continueTask")}</button>
            <button type="button" onClick={onDone} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-text-inverse">{t("markDone")}</button>
          </div>
          <p className="text-xs text-text-muted">{t("doneKeepsResources")}</p>
        </>}
      </div>
    </div>
  );
}
