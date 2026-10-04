"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from "react";
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

type CreateTaskModalContentProps = Pick<
  CreateTaskModalProps,
  "onClose" | "projects" | "defaultProjectId" | "defaultBaseBranch" | "defaultSessionType"
>;

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function slugifyToBranchName(title: string, prefix = "feat/"): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `${prefix}${slug}` : "";
}

function findProjectDefaultBranch(projects: Project[], projectId: string) {
  return projects.find((p) => p.id === projectId)?.defaultBranch ?? "";
}

function resolveInitialBaseBranch(
  projects: Project[],
  projectId: string,
  defaultBaseBranch?: string,
) {
  if (!projectId) return "";
  return defaultBaseBranch || findProjectDefaultBranch(projects, projectId);
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.tabIndex >= 0 && !element.hasAttribute("disabled"));
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  projects,
  defaultProjectId,
  defaultBaseBranch,
  defaultSessionType,
}: CreateTaskModalProps) {
  if (!isOpen) return null;

  return (
    <CreateTaskModalContent
      onClose={onClose}
      projects={projects}
      defaultProjectId={defaultProjectId}
      defaultBaseBranch={defaultBaseBranch}
      defaultSessionType={defaultSessionType}
    />
  );
}

function CreateTaskModalContent({
  onClose,
  projects,
  defaultProjectId,
  defaultBaseBranch,
  defaultSessionType,
}: CreateTaskModalContentProps) {
  const t = useTranslations("task");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const initialProjectId = defaultProjectId || "";
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [branches, setBranches] = useState<string[]>([]);
  const [baseBranch, setBaseBranch] = useState(() =>
    resolveInitialBaseBranch(projects, initialProjectId, defaultBaseBranch)
  );
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [taskTitle, setTaskTitle] = useState("");
  const [branchName, setBranchName] = useState("");
  const [isBranchCustomized, setIsBranchCustomized] = useState(false);
  const [selectedAgentType, setSelectedAgentType] = useState<string | null>(null);
  const [autoStartAgent, setAutoStartAgent] = useState(true);

  /** worktree가 아닌 프로젝트만 필터링한다 */
  const availableProjects = projects.filter((p) => !p.isWorktree);

  const handleProjectSelect = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId);
      setBaseBranch(projectId ? findProjectDefaultBranch(projects, projectId) : "");
      setBranches([]);
    },
    [projects],
  );

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTaskTitle(newTitle);
    if (!isBranchCustomized) {
      setBranchName(slugifyToBranchName(newTitle));
    }
  };

  const handleBranchNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBranchName(e.target.value);
    setIsBranchCustomized(true);
  };

  const handleAgentSelect = (agent: string | null) => {
    setSelectedAgentType(agent);
    if (agent) {
      setAutoStartAgent(true);
    }
  };

  useEffect(() => {
    if (!selectedProjectId) return;

    let isCancelled = false;
    getProjectBranches(selectedProjectId).then((result) => {
      if (isCancelled) return;

      setBranches(result);
      /** defaultBaseBranch가 브랜치 목록에 없으면 옵션에 추가한다 */
      if (defaultBaseBranch && !result.includes(defaultBaseBranch)) {
        setBranches((prev) => [defaultBaseBranch, ...prev]);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [selectedProjectId, defaultBaseBranch]);

  useEscapeKey(onClose);

  useEffect(() => {
    const focusableElements = getFocusableElements(dialogRef.current);
    if (selectedProjectId) {
      return;
    }

    focusableElements[0]?.focus();
  }, [selectedProjectId]);

  const branchOptions = baseBranch && !branches.includes(baseBranch)
    ? [baseBranch, ...branches]
    : branches;
  const selectedProjectName = projects.find((project) => project.id === selectedProjectId)?.name;

  function handleSubmit(formData: FormData) {
    const submittedBranchName = (formData.get("branchName") as string) || branchName;
    if (!submittedBranchName || !selectedProjectId) return;
    setError(null);

    startTransition(async () => {
      try {
        const sessionType = (formData.get("sessionType") as SessionType) || undefined;
        const titleValue = (formData.get("title") as string)?.trim() || taskTitle.trim() || submittedBranchName;
        const descriptionValue = (formData.get("description") as string)?.trim() || undefined;
        const agentTypeValue = (formData.get("agentType") as string)?.trim() || selectedAgentType || undefined;
        const shouldAutoStart = formData.get("autoStart") === "on" || autoStartAgent;

        const taskInput: CreateTaskInput = {
          title: titleValue,
          description: descriptionValue,
          branchName: submittedBranchName,
          baseBranch: baseBranch || undefined,
          sessionType,
          sshHost: (formData.get("sshHost") as string) || undefined,
          projectId: selectedProjectId,
          priority: priority || undefined,
        };
        if (agentTypeValue) {
          taskInput.agentType = agentTypeValue;
        }

        const created = await createTask(taskInput);
        onClose();
        const searchParams = (shouldAutoStart && agentTypeValue) ? "autostart=1" : undefined;
        await navigateToTaskDetail(created.id, {
          currentLocale: pathname.split("/").filter(Boolean)[0],
          navigate: router.push,
          searchParams,
        });
      } catch (error) {
        setError(error instanceof Error ? error.message : t("createFailed"));
      }
    });
  }

  function handleFormKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (
      event.key !== "Enter" ||
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    if (event.target instanceof HTMLButtonElement) {
      return;
    }

    event.preventDefault();
    event.currentTarget.requestSubmit();
  }

  function handleDialogKeyDownCapture(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);
    if (focusableElements.length === 0) {
      return;
    }

    const activeElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const currentIndex = activeElement ? focusableElements.indexOf(activeElement) : -1;

    if (event.shiftKey) {
      if (currentIndex <= 0) {
        event.preventDefault();
        focusableElements[focusableElements.length - 1]?.focus();
      }
      return;
    }

    if (currentIndex === -1 || currentIndex === focusableElements.length - 1) {
      event.preventDefault();
      focusableElements[0]?.focus();
    }
  }

  return (
    <div
      ref={dialogRef}
      data-terminal-focus-blocker="true"
      className="fixed inset-0 z-[400] flex items-center justify-center bg-bg-overlay"
      onKeyDownCapture={handleDialogKeyDownCapture}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-bg-surface rounded-xl border border-border-default shadow-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          {t("createTitle")}
        </h2>

        <form action={handleSubmit} className="space-y-4" onKeyDown={handleFormKeyDown}>
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t("project")} *
            </label>
            <ProjectSelector
              projects={availableProjects}
              selectedProjectId={selectedProjectId}
              onSelect={handleProjectSelect}
              placeholder={t("projectSelect")}
              searchPlaceholder={t("projectSearch")}
            />
          </div>

          <div>
            <label
              htmlFor="create-task-title"
              className="block text-sm text-text-secondary mb-1"
            >
              {t("taskTitle")}
            </label>
            <input
              id="create-task-title"
              name="title"
              value={taskTitle}
              onChange={handleTitleChange}
              placeholder={t("taskTitlePlaceholder")}
              className="w-full px-3 py-2 bg-bg-page border border-border-default rounded-md text-text-primary focus:outline-none focus:border-brand-primary text-sm transition-colors"
            />
          </div>

          {selectedProjectId && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                {t("baseBranch")}
              </label>
              <BranchSearchInput
                branches={branchOptions}
                value={baseBranch}
                onChange={setBaseBranch}
                projectName={selectedProjectName}
                autoFocus
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="create-task-branch-name"
                className="block text-sm text-text-secondary"
              >
                {t("branchName")} *
              </label>
              {!isBranchCustomized && branchName && (
                <span className="text-[11px] text-text-muted">
                  {t("autoBranchHint")}
                </span>
              )}
            </div>
            <input
              id="create-task-branch-name"
              name="branchName"
              value={branchName}
              onChange={handleBranchNameChange}
              required
              className="w-full px-3 py-2 bg-bg-page border border-border-default rounded-md text-text-primary focus:outline-none focus:border-brand-primary font-mono text-sm transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("agentType")}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: null, label: t("agentNone"), provider: null },
                { id: "claude", label: "Claude", provider: "claude" as const },
                { id: "codex", label: "Codex", provider: "codex" as const },
                { id: "antigravity", label: "Antigravity", provider: "antigravity" as const },
              ].map((agent) => {
                const isSelected = selectedAgentType === agent.id;
                return (
                  <button
                    key={agent.id ?? "none"}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => handleAgentSelect(agent.id)}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-medium transition-all ${
                      isSelected
                        ? "border-brand-primary bg-brand-primary/10 text-text-primary ring-1 ring-brand-primary"
                        : "border-border-default bg-bg-page text-text-muted hover:border-border-hover hover:text-text-primary"
                    }`}
                  >
                    {agent.provider ? (
                      <AiProviderIcon provider={agent.provider} size={20} className="mb-1" />
                    ) : (
                      <span className="w-5 h-5 mb-1 flex items-center justify-center text-text-muted font-mono text-[10px]">
                        $_
                      </span>
                    )}
                    <span className="truncate w-full text-center">{agent.label}</span>
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="agentType" value={selectedAgentType || ""} />
            {selectedAgentType && (
              <label className="flex items-center gap-2 mt-2 text-xs text-text-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="autoStart"
                  checked={autoStartAgent}
                  onChange={(e) => setAutoStartAgent(e.target.checked)}
                  className="rounded border-border-default text-brand-primary focus:ring-brand-primary"
                />
                <span>{t("agentAutoStart")}</span>
              </label>
            )}
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t("promptLabel")}
            </label>
            <textarea
              name="description"
              rows={3}
              className="w-full px-3 py-2 bg-bg-page border border-border-default rounded-md text-text-primary focus:outline-none focus:border-brand-primary resize-none transition-colors text-sm"
              placeholder={t("promptPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                {t("priority")}
              </label>
              <PrioritySelector value={priority} onChange={setPriority} />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1">
                {t("sessionType")}
              </label>
              <select
                name="sessionType"
                defaultValue={defaultSessionType || "tmux"}
                className="w-full px-3 py-2 bg-bg-page border border-border-default rounded-md text-text-primary focus:outline-none focus:border-brand-primary text-sm transition-colors"
              >
                <SessionTypeOptions />
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-status-error">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              {tc("cancel")}
            </button>
            <button
              type="submit"
              disabled={isPending || !selectedProjectId}
              className="px-4 py-2 text-sm bg-brand-primary hover:bg-brand-hover disabled:opacity-50 text-text-inverse rounded-md font-medium transition-colors"
            >
              {isPending ? tc("creating") : tc("create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
