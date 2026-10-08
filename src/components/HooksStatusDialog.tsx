"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  installTaskHooks,
  installTaskAntigravityHooks,
  installTaskCodexHooks,
  installTaskOpenCodeHooks,
  getTaskHooksStatus,
  getTaskAntigravityHooksStatus,
  getTaskCodexHooksStatus,
  getTaskOpenCodeHooksStatus,
} from "@/desktop/renderer/actions/project";
import { AiProviderIcon, type AiProviderIconName } from "@/components/AiProviderIcon";
import type { ClaudeHooksStatus } from "@/lib/claudeHooksSetup";
import type { AntigravityHooksStatus } from "@/lib/antigravityHooksSetup";
import type { CodexHooksStatus } from "@/lib/codexHooksSetup";
import type { OpenCodeHooksStatus } from "@/lib/openCodeHooksSetup";
import { useEscapeKey } from "@/hooks/useEscapeKey";

interface HooksStatusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  claudeStatus: ClaudeHooksStatus | null;
  antigravityStatus: AntigravityHooksStatus | null;
  codexStatus: CodexHooksStatus | null;
  openCodeStatus: OpenCodeHooksStatus | null;
  isRemote: boolean;
  onStatusesChange?: (updates: {
    claudeStatus?: ClaudeHooksStatus | null;
    antigravityStatus?: AntigravityHooksStatus | null;
    codexStatus?: CodexHooksStatus | null;
    openCodeStatus?: OpenCodeHooksStatus | null;
  }) => void;
}

type HookToolKey = "claude" | "antigravity" | "codex" | "openCode";
type HookStatusUpdates = {
  claudeStatus?: ClaudeHooksStatus | null;
  antigravityStatus?: AntigravityHooksStatus | null;
  codexStatus?: CodexHooksStatus | null;
  openCodeStatus?: OpenCodeHooksStatus | null;
};

export default function HooksStatusDialog({
  isOpen,
  onClose,
  taskId,
  claudeStatus,
  antigravityStatus,
  codexStatus,
  openCodeStatus,
  isRemote,
  onStatusesChange,
}: HooksStatusDialogProps) {
  const t = useTranslations("taskDetail");
  const [installingTools, setInstallingTools] = useState<HookToolKey[]>([]);
  const [expandedManualTool, setExpandedManualTool] = useState<HookToolKey | null>(null);
  const [localClaudeStatus, setLocalClaudeStatus] = useState(claudeStatus);
  const [localAntigravityStatus, setLocalAntigravityStatus] = useState(antigravityStatus);
  const [localCodexStatus, setLocalCodexStatus] = useState(codexStatus);
  const [localOpenCodeStatus, setLocalOpenCodeStatus] = useState(openCodeStatus);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const onStatusesChangeRef = useRef(onStatusesChange);

  useEscapeKey(onClose, { enabled: isOpen });

  useEffect(() => {
    onStatusesChangeRef.current = onStatusesChange;
  }, [onStatusesChange]);

  useEffect(() => {
    setLocalClaudeStatus(claudeStatus);
  }, [claudeStatus]);

  useEffect(() => {
    setLocalAntigravityStatus(antigravityStatus);
  }, [antigravityStatus]);

  useEffect(() => {
    setLocalCodexStatus(codexStatus);
  }, [codexStatus]);

  useEffect(() => {
    setLocalOpenCodeStatus(openCodeStatus);
  }, [openCodeStatus]);

  useEffect(() => {
    setMessage(null);
    setExpandedManualTool(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const latestStatus = await getTaskOpenCodeHooksStatus(taskId);
      if (cancelled) {
        return;
      }

      setLocalOpenCodeStatus(latestStatus);
      onStatusesChangeRef.current?.({ openCodeStatus: latestStatus });
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, taskId]);

  function getInstallFailureText(error?: string) {
    return error ? t("hooksInstallFailed", { error }) : t("hooksInstallFailed");
  }

  function getInstallIncompleteText() {
    return t("hooksInstallIncomplete");
  }

  function applyClaudeResult(result: Awaited<ReturnType<typeof installTaskHooks>>) {
    if (result.success && result.status) {
      setLocalClaudeStatus(result.status);
      onStatusesChange?.({ claudeStatus: result.status });
      setMessage({
        type: result.status.installed ? "success" : "error",
        text: result.status.installed ? t("hooksInstallSuccess") : getInstallIncompleteText(),
      });
      return;
    }

    setMessage({ type: "error", text: getInstallFailureText(result.error) });
  }

  function applyAntigravityResult(result: Awaited<ReturnType<typeof installTaskAntigravityHooks>>) {
    if (result.success && result.status) {
      setLocalAntigravityStatus(result.status);
      onStatusesChange?.({ antigravityStatus: result.status });
      setMessage({
        type: result.status.installed ? "success" : "error",
        text: result.status.installed ? t("antigravityHooksInstallSuccess") : getInstallIncompleteText(),
      });
      return;
    }

    setMessage({ type: "error", text: getInstallFailureText(result.error) });
  }

  function applyCodexResult(result: Awaited<ReturnType<typeof installTaskCodexHooks>>) {
    if (result.success && result.status) {
      setLocalCodexStatus(result.status);
      onStatusesChange?.({ codexStatus: result.status });
      setMessage({
        type: result.status.installed ? "success" : "error",
        text: result.status.installed ? t("codexHooksInstallSuccess") : getInstallIncompleteText(),
      });
      return;
    }

    setMessage({ type: "error", text: getInstallFailureText(result.error) });
  }

  function applyOpenCodeResult(result: Awaited<ReturnType<typeof installTaskOpenCodeHooks>>) {
    if (result.success && result.status) {
      setLocalOpenCodeStatus(result.status);
      onStatusesChange?.({ openCodeStatus: result.status });
      setMessage({
        type: result.status.installed ? "success" : "error",
        text: result.status.installed ? t("openCodeHooksInstallSuccess") : getInstallIncompleteText(),
      });
      return;
    }

    setMessage({ type: "error", text: getInstallFailureText(result.error) });
  }

  async function runInstall<T>(
    tool: HookToolKey,
    install: () => Promise<T>,
    applyResult: (result: T) => void,
  ) {
    setMessage(null);
    setInstallingTools((current) => (current.includes(tool) ? current : [...current, tool]));

    try {
      const result = await install();
      applyResult(result);
      if (isSuccessfulInstallResult(result)) {
        await refreshAllHookStatuses().catch(() => undefined);
      }
    } finally {
      setInstallingTools((current) => current.filter((value) => value !== tool));
    }
  }

  async function refreshAllHookStatuses() {
    const [latestClaudeStatus, latestAntigravityStatus, latestCodexStatus, latestOpenCodeStatus] = await Promise.all([
      getTaskHooksStatus(taskId),
      getTaskAntigravityHooksStatus(taskId),
      getTaskCodexHooksStatus(taskId),
      getTaskOpenCodeHooksStatus(taskId),
    ]);

    applyRefreshedStatuses({
      claudeStatus: latestClaudeStatus,
      antigravityStatus: latestAntigravityStatus,
      codexStatus: latestCodexStatus,
      openCodeStatus: latestOpenCodeStatus,
    });
  }

  function applyRefreshedStatuses(updates: HookStatusUpdates) {
    const parentUpdates: HookStatusUpdates = {};

    if (updates.claudeStatus) {
      setLocalClaudeStatus(updates.claudeStatus);
      parentUpdates.claudeStatus = updates.claudeStatus;
    }
    if (updates.antigravityStatus) {
      setLocalAntigravityStatus(updates.antigravityStatus);
      parentUpdates.antigravityStatus = updates.antigravityStatus;
    }
    if (updates.codexStatus) {
      setLocalCodexStatus(updates.codexStatus);
      parentUpdates.codexStatus = updates.codexStatus;
    }
    if (updates.openCodeStatus) {
      setLocalOpenCodeStatus(updates.openCodeStatus);
      parentUpdates.openCodeStatus = updates.openCodeStatus;
    }

    if (Object.keys(parentUpdates).length > 0) {
      onStatusesChangeRef.current?.(parentUpdates);
    }
  }

  const hookItems = [
    {
      key: "claude" as const,
      title: "Claude",
      status: localClaudeStatus,
      files: [
        ".claude/hooks/kanvibe-prompt-hook.sh",
        ".claude/hooks/kanvibe-question-hook.sh",
        ".claude/hooks/kanvibe-stop-hook.sh",
        ".claude/settings.json",
      ],
      onInstall: () => runInstall("claude", () => installTaskHooks(taskId), applyClaudeResult),
    },
    {
      key: "antigravity" as const,
      title: "Antigravity",
      status: localAntigravityStatus,
      files: [
        ".agents/hooks/kanvibe-prompt-hook.sh",
        ".agents/hooks/kanvibe-stop-hook.sh",
        ".agents/hooks.json",
      ],
      onInstall: () => runInstall("antigravity", () => installTaskAntigravityHooks(taskId), applyAntigravityResult),
    },
    {
      key: "codex" as const,
      title: "Codex",
      status: localCodexStatus,
      files: [
        ".codex/hooks/kanvibe-prompt-hook.sh",
        ".codex/hooks/kanvibe-permission-hook.sh",
        ".codex/hooks/kanvibe-pre-tool-hook.sh",
        ".codex/hooks/kanvibe-stop-hook.sh",
        ".codex/hooks.json",
        ".codex/config.toml",
      ],
      onInstall: () => runInstall("codex", () => installTaskCodexHooks(taskId), applyCodexResult),
    },
    {
      key: "openCode" as const,
      title: "OpenCode",
      status: localOpenCodeStatus,
      files: [
        ".opencode/plugins/kanvibe-plugin.ts",
      ],
      onInstall: () => runInstall("openCode", () => installTaskOpenCodeHooks(taskId), applyOpenCodeResult),
    },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border-default bg-bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t("hooksStatus")}</h2>
            <p className="mt-1 text-sm text-text-muted">{t("hooksCurrentTaskId", { taskId })}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-lg text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {message ? (
          <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${message.type === "success"
            ? "border-status-done/20 bg-status-done/10 text-status-done"
            : "border-status-error/20 bg-status-error/10 text-status-error"
          }`}>
            {message.text}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {hookItems.map((item) => {
            const isInstalled = item.status?.installed === true;
            const isInstalling = installingTools.includes(item.key);

            return (
              <section key={item.key} className="rounded-xl border border-border-default bg-bg-page/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${isInstalled
                      ? "border-status-done/20 bg-status-done/10"
                      : "border-status-error/20 bg-status-error/10"
                    }`}>
                      <HookToolIcon tool={item.key} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-text-primary">{item.title}</h3>
                      <p className="mt-1 text-xs text-text-muted">{isInstalled ? t("hooksInstalled") : t("hooksNotInstalled")}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium ${isInstalled
                    ? "border-status-done/20 bg-status-done/15 text-status-done"
                    : "border-status-error/20 bg-status-error/15 text-status-error"
                  }`}>
                    {isInstalled ? t("hooksInstalled") : t("hooksNotInstalled")}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (isInstalling) {
                        return;
                      }

                      void item.onInstall();
                    }}
                    disabled={isInstalling}
                    className={`rounded-md px-3 py-1.5 text-xs transition-colors ${isInstalled
                      ? "border border-border-default bg-bg-surface text-text-secondary hover:border-brand-primary hover:text-text-primary"
                      : "bg-brand-primary text-text-inverse hover:bg-brand-hover"
                    } ${isInstalling ? "opacity-50" : ""}`}
                  >
                    {isInstalling
                      ? t("installingHooks")
                      : isInstalled
                        ? t("hooksStatusDialog.reinstall")
                        : t("installHooks")}
                  </button>
                  {!isInstalled && !isRemote ? (
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedManualTool((current) => current === item.key ? null : item.key);
                      }}
                      className="rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-brand-primary hover:text-text-primary"
                    >
                      {expandedManualTool === item.key ? t("close") : t("hooksManualInstallGuide")}
                    </button>
                  ) : null}
                </div>

                {expandedManualTool === item.key && !isRemote && !isInstalled ? (
                  <div className="mt-4 rounded-lg border border-border-default bg-bg-surface p-3">
                    <p className="text-xs text-text-secondary">{t("hooksManualInstallDescription", { tool: item.title })}</p>
                    <p className="mt-3 text-[11px] font-medium text-text-secondary">{t("hooksManualFiles")}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.files.map((filePath) => (
                        <span key={filePath} className="rounded-full border border-border-default bg-bg-page px-2 py-1 text-[11px] text-text-muted">
                          {filePath}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] text-text-muted">{t("hooksManualRecheck")}</p>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border-default bg-bg-page px-4 py-1.5 text-sm text-text-secondary transition-colors hover:border-brand-primary hover:text-text-primary disabled:opacity-50"
          >
            {t("hooksStatusDialog.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function HookToolIcon({ tool }: { tool: HookToolKey }) {
  const providerByTool: Record<HookToolKey, AiProviderIconName> = {
    claude: "claude",
    antigravity: "antigravity",
    codex: "codex",
    openCode: "opencode",
  };

  return (
    <AiProviderIcon
      provider={providerByTool[tool]}
      testId="hook-status-tool-icon"
      className="inline-flex h-[18px] w-[18px] items-center justify-center"
      imageClassName="block h-[18px] w-[18px] object-contain"
      size={18}
    />
  );
}

function isSuccessfulInstallResult(result: unknown): result is { success: true } {
  return result !== null
    && typeof result === "object"
    && "success" in result
    && (result as { success?: unknown }).success === true;
}
