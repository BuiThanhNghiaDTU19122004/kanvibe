"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getSearchableTasks,
  type SearchableTask,
} from "@/desktop/renderer/actions/kanban";
import { usePathname, useRouter } from "@/desktop/renderer/navigation";
import { navigateToTaskDetail } from "@/desktop/renderer/utils/taskNavigation";
import {
  formatShortcutForDisplay,
  getCurrentShortcutPlatform,
  isBlockedShortcutEvent,
  matchShortcutEvent,
} from "@/desktop/renderer/utils/keyboardShortcut";
import { requestActiveTerminalFocusAfterUiSettles } from "@/desktop/renderer/utils/terminalFocus";
import { useAgentMonitor } from "@/desktop/renderer/hooks/useLiveAiSessions";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useHasBoardShortcutBlocker } from "@/desktop/renderer/components/BoardCommandProvider";
import { useShortcutBindings } from "@/desktop/renderer/utils/shortcutBindings";

/**
 * 단축키 밖에서 패널을 열 트리거(커맨드 팔레트 등)가 쓰는 이벤트.
 * 다이얼로그가 전역 상태 없이도 열 수 있도록 창 이벤트로 신호를 준다.
 */
export const CONTROL_PANEL_OPEN_EVENT = "kanvibe:open-control-panel";

interface ControlPanelDialogProps {
  shortcut?: string;
}

interface TaskGroup {
  key: string;
  label: string | null;
  tasks: SearchableTask[];
}

/** 실행 중 에이전트 판정. runtimes만 taskId를 가지므로 판정 근거는 여기뿐이다 */
function isAgentRuntimeActive(state: string): boolean {
  return state === "starting" || state === "running";
}

function buildTaskGroups(tasks: SearchableTask[], query: string): TaskGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTasks = normalizedQuery
    ? tasks.filter((task) => (
      [task.title, task.branchName, task.projectName]
        .some((field) => (field ?? "").toLowerCase().includes(normalizedQuery))
    ))
    : tasks;

  const groupsByProject = new Map<string, TaskGroup>();
  for (const task of filteredTasks) {
    const groupKey = task.projectName ?? "";
    const existingGroup = groupsByProject.get(groupKey);
    if (existingGroup) {
      existingGroup.tasks.push(task);
    } else {
      groupsByProject.set(groupKey, {
        key: groupKey || "no-project",
        label: task.projectName,
        tasks: [task],
      });
    }
  }

  return [...groupsByProject.values()]
    .map((group) => ({
      ...group,
      tasks: [...group.tasks].sort((left, right) => (
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      )),
    }))
    .sort((left, right) => {
      /** 프로젝트가 없는 묶음은 알파벳 정렬 대상이 아니므로 항상 맨 뒤로 */
      if (left.label === null) {
        return right.label === null ? 0 : 1;
      }

      if (right.label === null) {
        return -1;
      }

      return left.label.localeCompare(right.label);
    });
}

export default function ControlPanelDialog({
  shortcut,
}: ControlPanelDialogProps) {
  const hasShortcutBlocker = useHasBoardShortcutBlocker();
  const t = useTranslations("controlPanel");
  const tBoard = useTranslations("board");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<SearchableTask[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const shortcutPlatform = getCurrentShortcutPlatform();
  const shortcutBindings = useShortcutBindings();
  const effectiveShortcut = shortcut || shortcutBindings.controlPanel;

  /** 패널이 열려 있는 동안에만 폴링한다 */
  const agentMonitor = useAgentMonitor(isOpen);
  const runningAgentTaskIds = useMemo(() => {
    const taskIds = new Set<string>();
    if (!agentMonitor.error) {
      for (const runtime of agentMonitor.value.runtimes) {
        if (isAgentRuntimeActive(runtime.state)) {
          taskIds.add(runtime.taskId);
        }
      }
    }

    return taskIds;
  }, [agentMonitor]);

  const groups = useMemo(() => buildTaskGroups(tasks, query), [query, tasks]);
  const flatTasks = useMemo(() => groups.flatMap((group) => group.tasks), [groups]);
  const taskIndexById = useMemo(
    () => new Map(flatTasks.map((task, index) => [task.id, index])),
    [flatTasks],
  );
  const selectedTaskIndex = flatTasks.length === 0
    ? 0
    : Math.min(selectedIndex, flatTasks.length - 1);

  const openDialog = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
    setIsLoading(true);
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(0);
    setIsLoading(false);
    requestActiveTerminalFocusAfterUiSettles();
  }, []);


  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (isBlockedShortcutEvent(event, shortcutPlatform)) {
        event.preventDefault();
        return;
      }

      if (hasShortcutBlocker) {
        return;
      }

      const eventTarget = event.target;
      if (eventTarget instanceof Element && eventTarget.closest('[data-shortcut-capture="true"]')) {
        return;
      }

      if (!matchShortcutEvent(event, effectiveShortcut, shortcutPlatform)) {
        return;
      }

      event.preventDefault();
      if (isOpen) {
        closeDialog();
        return;
      }

      openDialog();
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [closeDialog, effectiveShortcut, hasShortcutBlocker, isOpen, openDialog, shortcutPlatform]);

  useEffect(() => {
    function handleOpenRequest() {
      openDialog();
    }

    window.addEventListener(CONTROL_PANEL_OPEN_EVENT, handleOpenRequest);
    return () => {
      window.removeEventListener(CONTROL_PANEL_OPEN_EVENT, handleOpenRequest);
    };
  }, [openDialog]);

  /**
   * 데스크톱에서는 main이 before-input-event에서 단축키를 가로채 렌더러 keydown이 오지 않는다.
   * commandPalette와 같은 IPC 경로로도 열고 닫을 수 있어야 한다.
   */
  useEffect(() => {
    const unsubscribe = window.kanvibeDesktop?.onControlPanelShortcut?.(() => {
      if (hasShortcutBlocker) {
        return;
      }

      if (isOpen) {
        closeDialog();
        return;
      }

      openDialog();
    });

    return unsubscribe;
  }, [closeDialog, hasShortcutBlocker, isOpen, openDialog]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();

    let cancelled = false;

    getSearchableTasks()
      .then((nextTasks) => {
        if (!cancelled) {
          setTasks(nextTasks);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const selectedRow = resultsListRef.current?.querySelector('[data-selected="true"]');
    if (selectedRow instanceof HTMLElement) {
      selectedRow.scrollIntoView({ block: "nearest" });
    }
  }, [flatTasks, isOpen, selectedTaskIndex]);

  useEscapeKey(closeDialog, { enabled: isOpen });

  function getCurrentLocale() {
    const currentLocale = pathname.split("/").filter(Boolean)[0];
    return currentLocale;
  }

  async function moveToTask(task: SearchableTask) {
    await navigateToTaskDetail(task.id, {
      currentLocale: getCurrentLocale(),
      navigate: router.push,
      searchParams: task.hasTerminal ? "view=terminal" : undefined,
    });
    closeDialog();
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedIndex((current) => (
          flatTasks.length === 0 ? 0 : Math.min(current + 1, flatTasks.length - 1)
        ));
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
        break;
      case "Enter": {
        event.preventDefault();
        const selectedTask = flatTasks[selectedTaskIndex];
        if (selectedTask) {
          void moveToTask(selectedTask);
        }
        break;
      }
      case "Escape":
        event.preventDefault();
        closeDialog();
        break;
    }
  }


  if (!isOpen) {
    return null;
  }

  const shortcutHint = t("shortcutHint", {
    shortcut: formatShortcutForDisplay(effectiveShortcut, shortcutPlatform),
  });

  return (
    <div data-terminal-focus-blocker="true" className="fixed inset-0 z-[500] flex items-start justify-center bg-black/45 px-4 pt-24">
      <button
        type="button"
        aria-label={tc("close")}
        className="absolute inset-0 cursor-default"
        onClick={closeDialog}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-2xl"
      >
        <div className="border-b border-border-default px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-text-primary">{t("title")}</p>
            <p className="shrink-0 text-xs text-text-muted">{shortcutHint}</p>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={t("filterPlaceholder")}
            className="mt-3 w-full rounded-md border border-border-default bg-bg-page px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-brand-primary"
          />
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-6 text-sm text-text-muted">{tc("loading")}</div>
          ) : groups.length === 0 ? (
            <div className="px-4 py-6 text-sm text-text-muted">{t("empty")}</div>
          ) : (
            <div ref={resultsListRef}>
              {groups.map((group) => (
                <div key={group.key}>
                  <div className="border-b border-border-subtle bg-bg-page px-4 py-1.5 text-xs font-semibold text-text-muted">
                    {group.label ?? t("noProject")}
                  </div>
                  {group.tasks.map((task) => {
                    const taskIndex = taskIndexById.get(task.id) ?? 0;
                    const isAgentRunning = runningAgentTaskIds.has(task.id);
                    const rowAriaLabel = [
                      task.title,
                      task.branchName ? `(${task.branchName})` : null,
                      tBoard(`columns.${task.status}`),
                      task.hasTerminal ? t("terminal") : null,
                      isAgentRunning ? t("agentRunning") : null,
                    ].filter(Boolean).join(", ");

                    return (
                      <button
                        key={task.id}
                        type="button"
                        data-selected={taskIndex === selectedTaskIndex ? "true" : undefined}
                        aria-label={rowAriaLabel}
                        onClick={() => void moveToTask(task)}
                        onMouseEnter={() => setSelectedIndex(taskIndex)}
                        className={`flex w-full items-start justify-between gap-4 border-b border-border-subtle px-4 py-3 text-left transition-colors ${
                          taskIndex === selectedTaskIndex
                            ? "bg-brand-primary/10"
                            : "hover:bg-bg-page"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-text-primary">{task.title}</div>
                          {task.branchName ? (
                            <div className="mt-1 truncate font-mono text-xs text-text-muted">{task.branchName}</div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full border border-border-default px-2 py-0.5 text-[11px] text-text-secondary">
                            {tBoard(`columns.${task.status}`)}
                          </span>
                          {task.hasTerminal ? (
                            <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-[11px] text-text-brand">
                              {t("terminal")}
                            </span>
                          ) : null}
                          {isAgentRunning ? (
                            <span className="rounded-full bg-status-success/15 px-2 py-0.5 text-[11px] text-status-success">
                              {t("agentRunning")}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border-default px-4 py-2 text-xs text-text-muted">
          {[t("hint"), shortcutHint].join(" · ")}
        </div>
      </div>
    </div>
  );
}

