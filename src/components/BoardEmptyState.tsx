"use client";

import { useTranslations } from "next-intl";

interface BoardEmptyStateProps {
  onNewTask: () => void;
  onScanProjects: () => void;
  hasProjects: boolean;
}

export default function BoardEmptyState({
  onNewTask,
  onScanProjects,
  hasProjects,
}: BoardEmptyStateProps) {
  const t = useTranslations("board");
  const tc = useTranslations("common");

  return (
    <div
      data-testid="board-empty-state"
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-default bg-bg-surface/50 px-6 py-16 text-center my-8 max-w-xl mx-auto"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-subtle text-brand-primary">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M8 7v10" />
          <path d="M16 7v10" />
          <path d="M12 7v10" />
        </svg>
      </div>

      <h3 className="text-lg font-semibold text-text-primary mb-1">
        {hasProjects ? t("emptyBoardTitle") : t("noProjectsTitle")}
      </h3>
      <p className="text-sm text-text-muted max-w-md mb-6 leading-relaxed">
        {hasProjects ? t("emptyBoardDescription") : t("noProjectsDescription")}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {hasProjects ? (
          <button
            type="button"
            onClick={onNewTask}
            data-testid="empty-state-new-task-btn"
            className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-text-inverse shadow-sm transition-colors hover:bg-brand-hover"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{t("newTask")}</span>
            <kbd className="ml-1 rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] uppercase">
              N
            </kbd>
          </button>
        ) : null}

        <button
          type="button"
          onClick={onScanProjects}
          data-testid="empty-state-scan-btn"
          className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-brand-primary hover:text-text-primary"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            <path d="M12 10v6" />
            <path d="M9 13h6" />
          </svg>
          <span>{hasProjects ? t("scanMoreProjects") : t("scanFirstProject")}</span>
        </button>
      </div>
    </div>
  );
}
