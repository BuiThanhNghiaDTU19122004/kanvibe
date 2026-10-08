"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/desktop/renderer/navigation";
import { createTask, type CreateTaskInput } from "@/desktop/renderer/actions/kanban";
import { getProjectBranches } from "@/desktop/renderer/actions/project";
import { navigateToTaskDetail } from "@/desktop/renderer/utils/taskNavigation";
import { SessionType } from "@/entities/KanbanTask";
import { TaskPriority } from "@/entities/TaskPriority";
import type { Project } from "@/entities/Project";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import ProjectSelector from "./ProjectSelector";
import PrioritySelector from "./PrioritySelector";
import BranchSearchInput from "./BranchSearchInput";
import SessionTypeOptions from "./SessionTypeOptions";
import { AiProviderIcon } from "./AiProviderIcon";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  sshHosts: string[];
  projects: Project[];
  defaultProjectId?: string;
  defaultBaseBranch?: string;
  defaultSessionType?: string;
}

export function slugifyToBranchName(title: string, prefix = "feat/"): string {
  const slug = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().trim().replace(/[^a-z0-9\s_-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return slug ? `${prefix}${slug.slice(0, 80)}` : "";
}

export default function CreateTaskModal(props: CreateTaskModalProps) {
  return props.isOpen ? <CreateTaskForm {...props} /> : null;
}

function CreateTaskForm({ onClose, projects, defaultProjectId, defaultBaseBranch, defaultSessionType }: CreateTaskModalProps) {
  const t = useTranslations("task");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const availableProjects = projects.filter((project) => !project.isWorktree);
  const initialProjectId = defaultProjectId || (availableProjects.length === 1 ? availableProjects[0].id : "");
  const [projectId, setProjectId] = useState(initialProjectId);
  const [branches, setBranches] = useState<string[]>([]);
  const [baseBranch, setBaseBranch] = useState(defaultBaseBranch || projects.find((project) => project.id === initialProjectId)?.defaultBranch || "");
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [titleCustomized, setTitleCustomized] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [branchCustomized, setBranchCustomized] = useState(false);
  const [agent, setAgent] = useState("claude");
  const [autoStart, setAutoStart] = useState(true);
  const branchFallback = useRef(`feat/task-${crypto.randomUUID().slice(0, 8)}`);
  const inputClass = "w-full rounded-md border border-border-default bg-bg-page px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand-primary";

  useEscapeKey(onClose, { enabled: !isPending });
  useEffect(() => {
    let cancelled = false;
    if (projectId) {
      void getProjectBranches(projectId).then((result) => {
        if (!cancelled) setBranches(result);
      }).catch(() => {
        if (!cancelled) setError(t("branchesFailed"));
      });
    }
    return () => { cancelled = true; };
  }, [projectId, t]);

  function updatePrompt(value: string) {
    setPrompt(value);
    const suggestedTitle = value.trim().split(/\r?\n/)[0].slice(0, 100);
    if (!titleCustomized) setTitle(suggestedTitle);
    if (!branchCustomized) setBranchName(slugifyToBranchName(titleCustomized ? title : suggestedTitle) || (value.trim() ? branchFallback.current : ""));
  }
  function updateTitle(value: string) {
    setTitle(value); setTitleCustomized(true);
    if (!branchCustomized) setBranchName(slugifyToBranchName(value) || branchFallback.current);
  }
  function handleSubmit(formData: FormData) {
    if (isPending || !projectId || !branchName.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const taskInput: CreateTaskInput = {
          title: title.trim() || branchName.trim(), description: prompt.trim() || undefined,
          branchName: branchName.trim(), baseBranch: baseBranch || undefined,
          sessionType: (formData.get("sessionType") as SessionType) || undefined,
          projectId, priority: priority || undefined, ...(agent ? { agentType: agent } : {}),
        };
        const created = await createTask(taskInput);
        onClose();
        await navigateToTaskDetail(created.id, { currentLocale: pathname.split("/").filter(Boolean)[0],
          navigate: router.push, searchParams: autoStart && agent ? "autostart=1" : undefined });
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : t("createFailed"));
      }
    });
  }
  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const items = [...dialogRef.current!.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]):not([type=hidden]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex='0']")]
      .filter((element) => !element.closest("details:not([open])") || element.tagName === "SUMMARY");
    const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t("createTitle")} data-terminal-focus-blocker="true"
      className="fixed inset-0 z-[400] flex items-center justify-center bg-bg-overlay p-4" onKeyDownCapture={trapFocus}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-border-default bg-bg-surface p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-text-primary">{t("createTitle")}</h2>
        <p className="mt-1 mb-5 text-sm text-text-muted">{t("createDescription")}</p>
        <form action={handleSubmit} className="space-y-4">
          <fieldset disabled={isPending} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-text-secondary">{t("project")} *</label>
              <ProjectSelector projects={availableProjects} selectedProjectId={projectId}
                onSelect={(nextId) => { setProjectId(nextId); setBaseBranch(projects.find((project) => project.id === nextId)?.defaultBranch || ""); setBranches([]); }}
                placeholder={t("projectSelect")} searchPlaceholder={t("projectSearch")} />
            </div>
            <div>
              <label htmlFor="create-task-prompt" className="mb-1 block text-sm text-text-secondary">{t("promptLabel")}</label>
              <textarea id="create-task-prompt" name="description" rows={4} value={prompt} autoFocus={!!projectId}
                onChange={(event) => updatePrompt(event.target.value)} className={`${inputClass} resize-y`} placeholder={t("promptPlaceholder")} />
            </div>
            <div>
              <label htmlFor="create-task-title" className="mb-1 block text-sm text-text-secondary">{t("taskTitle")}</label>
              <input id="create-task-title" name="title" value={title} onChange={(event) => updateTitle(event.target.value)}
                placeholder={t("taskTitlePlaceholder")} className={inputClass} />
              <p className="mt-1 text-xs text-text-muted">{t("titleSuggestion")}</p>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm text-text-secondary">{t("agentType")}</legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[{ id: "claude", label: "Claude Code" }, { id: "codex", label: "Codex" },
                  { id: "antigravity", label: "Antigravity" }, { id: "", label: t("agentNone") }].map((option) => (
                  <label key={option.id} className={`flex items-center gap-2 rounded-lg border p-2 text-xs cursor-pointer ${agent === option.id ? "border-brand-primary bg-brand-subtle text-text-primary" : "border-border-default text-text-secondary"}`}>
                    <input type="radio" name="agentType" value={option.id} checked={agent === option.id} onChange={() => setAgent(option.id)} />
                    {option.id && <AiProviderIcon provider={option.id as "claude" | "codex" | "antigravity"} size={16} />}
                    {option.label}
                  </label>
                ))}
              </div>
              {agent === "antigravity" && <p className="mt-2 text-xs text-status-warning">{t("limitedTracking")}</p>}
            </fieldset>
            <details className="rounded-lg border border-border-default p-3">
              <summary className="cursor-pointer text-sm font-medium text-text-secondary">{t("advancedOptions")}</summary>
              <div className="mt-4 space-y-4">
                {projectId && <div>
                  <label className="mb-1 block text-sm text-text-secondary">{t("baseBranch")}</label>
                  <BranchSearchInput branches={baseBranch && !branches.includes(baseBranch) ? [baseBranch, ...branches] : branches}
                    value={baseBranch} onChange={setBaseBranch} projectName={projects.find((project) => project.id === projectId)?.name} />
                </div>}
                <div>
                  <label htmlFor="create-task-branch-name" className="mb-1 block text-sm text-text-secondary">{t("branchName")} *</label>
                  <input id="create-task-branch-name" name="branchName" value={branchName}
                    onChange={(event) => { setBranchName(event.target.value); setBranchCustomized(true); }} className={`${inputClass} font-mono`} />
                  {!branchCustomized && branchName && <p className="mt-1 text-xs text-text-muted">{t("autoBranchHint")}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="mb-1 block text-sm text-text-secondary">{t("priority")}</label><PrioritySelector value={priority} onChange={setPriority} /></div>
                  <div><label htmlFor="create-task-session" className="mb-1 block text-sm text-text-secondary">{t("sessionType")}</label>
                    <select id="create-task-session" name="sessionType" defaultValue={defaultSessionType || (/Windows/i.test(navigator.userAgent) ? "terminal" : "tmux")} className={inputClass}><SessionTypeOptions /></select></div>
                </div>
                {agent && <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input type="checkbox" name="autoStart" checked={autoStart} onChange={(event) => setAutoStart(event.target.checked)} />{t("agentAutoStart")}
                </label>}
              </div>
            </details>
          </fieldset>
          {error && <p role="alert" className="text-sm text-status-error">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" disabled={isPending} onClick={onClose} className="px-4 py-2 text-sm text-text-muted">{tc("cancel")}</button>
            <button type="submit" disabled={isPending || !projectId || !branchName.trim()}
              className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-brand-hover disabled:opacity-50">
              {isPending ? tc("creating") : autoStart && agent ? t("startTask") : tc("create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
