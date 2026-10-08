"use client";
import LanguageSelector from "./LanguageSelector";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  setSidebarDefaultCollapsed,
  setNotificationEnabled,
  setNotificationStatuses,
  setDefaultSessionType,
  setThemePreference,
  setVimModeEnabled,
  setBackgroundSyncEnabled,
  setBackgroundSyncIntervalMs,
  type ThemePreference,
} from "@/desktop/renderer/actions/appSettings";
import { SessionType } from "@/entities/KanbanTask";
import { Link } from "@/desktop/renderer/navigation";
import type { Project } from "@/entities/Project";
import { applyThemePreference, notifyThemePreferenceChanged } from "@/desktop/renderer/utils/theme";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import SessionTypeOptions from "./SessionTypeOptions";
import { SETTINGS_SECTION_LABELS, type SettingsSection } from "@/desktop/shared/settingsSections";

const MIN_SYNC_INTERVAL_MINUTES = 1;
const MAX_SYNC_INTERVAL_MINUTES = 1440;

/** 알림 대상 상태 목록 (사용자가 직접 설정하는 todo/done은 제외) */
const STATUS_OPTIONS = [
  { value: "progress", labelKey: "progress" },
  { value: "pending", labelKey: "pending" },
  { value: "review", labelKey: "review" },
] as const;

interface ProjectSettingsProps {
  isOpen?: boolean;
  onClose?: () => void;
  variant?: "modal" | "page";
  section?: SettingsSection;
  projects?: Project[];
  sshHosts?: string[];
  sidebarDefaultCollapsed: boolean;
  defaultSessionType: SessionType;
  vimModeEnabled?: boolean;
  themePreference?: ThemePreference;
  onDefaultSessionTypeChange?: (sessionType: SessionType) => void;
  onVimModeEnabledChange?: (enabled: boolean) => void;
  onThemePreferenceChange?: (themePreference: ThemePreference) => void;
  notificationSettings: { isEnabled: boolean; enabledStatuses: string[] };
  backgroundSyncSettings: { isEnabled: boolean; intervalMs: number };
}

function areNotificationSettingsEqual(
  left: { isEnabled: boolean; enabledStatuses: string[] },
  right: { isEnabled: boolean; enabledStatuses: string[] },
) {
  return left.isEnabled === right.isEnabled
    && left.enabledStatuses.length === right.enabledStatuses.length
    && left.enabledStatuses.every((status, index) => status === right.enabledStatuses[index]);
}

function areBackgroundSyncSettingsEqual(
  left: { isEnabled: boolean; intervalMs: number },
  right: { isEnabled: boolean; intervalMs: number },
) {
  return left.isEnabled === right.isEnabled && left.intervalMs === right.intervalMs;
}

function formatSyncIntervalMinutes(intervalMs: number) {
  return String(Math.round(intervalMs / 60_000));
}

function parseSyncIntervalMinutes(value: string): number | null {
  const normalizedValue = value.trim();
  if (!/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const minutes = Number(normalizedValue);
  if (!Number.isSafeInteger(minutes) || minutes < MIN_SYNC_INTERVAL_MINUTES || minutes > MAX_SYNC_INTERVAL_MINUTES) {
    return null;
  }

  return minutes;
}

export default function ProjectSettings({
  isOpen,
  onClose,
  variant = "modal",
  section = "appearance",
  sidebarDefaultCollapsed,
  defaultSessionType,
  vimModeEnabled = true,
  themePreference = "system",
  onDefaultSessionTypeChange,
  onVimModeEnabledChange,
  onThemePreferenceChange,
  notificationSettings,
  backgroundSyncSettings,
}: ProjectSettingsProps) {
  const t = useTranslations("settings");
  const tb = useTranslations("board.columns");
  const [isPending, startTransition] = useTransition();
  const [isNotificationPending, startNotificationTransition] = useTransition();
  const [selectedDefaultSessionType, setSelectedDefaultSessionType] = useState(defaultSessionType);
  const [localVimModeEnabled, setLocalVimModeEnabled] = useState(vimModeEnabled);
  const [localNotificationSettings, setLocalNotificationSettings] = useState(notificationSettings);
  const [pendingNotificationSettings, setPendingNotificationSettings] = useState<typeof notificationSettings | null>(null);
  const [localThemePreference, setLocalThemePreference] = useState<ThemePreference>(themePreference);
  const [localSidebarDefaultCollapsed, setLocalSidebarDefaultCollapsed] = useState(sidebarDefaultCollapsed);
  const [localBackgroundSyncSettings, setLocalBackgroundSyncSettings] = useState(backgroundSyncSettings);
  const [pendingBackgroundSyncSettings, setPendingBackgroundSyncSettings] = useState<typeof backgroundSyncSettings | null>(null);
  const [backgroundSyncIntervalInputValue, setBackgroundSyncIntervalInputValue] = useState(
    () => formatSyncIntervalMinutes(backgroundSyncSettings.intervalMs),
  );
  const backgroundSyncIntervalSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const isPage = variant === "page";
  const Heading = isPage ? "h1" : "h2";

  function saveBackgroundSyncIntervalMs(nextIntervalMs: number) {
    const nextSave = backgroundSyncIntervalSaveQueueRef.current
      .catch(() => undefined)
      .then(() => setBackgroundSyncIntervalMs(nextIntervalMs));

    backgroundSyncIntervalSaveQueueRef.current = nextSave;
    return nextSave;
  }

  useEffect(() => {
    setSelectedDefaultSessionType(defaultSessionType);
  }, [defaultSessionType]);

  useEffect(() => {
    setLocalVimModeEnabled(vimModeEnabled);
  }, [vimModeEnabled]);

  useEffect(() => {
    setLocalSidebarDefaultCollapsed(sidebarDefaultCollapsed);
  }, [sidebarDefaultCollapsed]);

  useEffect(() => {
    if (pendingBackgroundSyncSettings && !areBackgroundSyncSettingsEqual(backgroundSyncSettings, pendingBackgroundSyncSettings)) {
      return;
    }

    setLocalBackgroundSyncSettings(backgroundSyncSettings);
    setPendingBackgroundSyncSettings(null);
    setBackgroundSyncIntervalInputValue(formatSyncIntervalMinutes(backgroundSyncSettings.intervalMs));
  }, [backgroundSyncSettings, pendingBackgroundSyncSettings]);

  useEffect(() => {
    setLocalThemePreference(themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (pendingNotificationSettings && !areNotificationSettingsEqual(notificationSettings, pendingNotificationSettings)) {
      return;
    }

    setLocalNotificationSettings(notificationSettings);
    setPendingNotificationSettings(null);
  }, [notificationSettings, pendingNotificationSettings]);

  useEscapeKey(() => onClose?.(), { enabled: !isPage && !!isOpen });

  if (!isPage && !isOpen) return null;

  function handleThemePreferenceChange(nextThemePreference: ThemePreference) {
    setLocalThemePreference(nextThemePreference);
    applyThemePreference(nextThemePreference);
    notifyThemePreferenceChanged(nextThemePreference);
    onThemePreferenceChange?.(nextThemePreference);
    startTransition(async () => {
      await setThemePreference(nextThemePreference);
    });
  }

  return (
    <div className={isPage ? "w-full text-text-primary" : "fixed inset-0 z-[400] flex items-start justify-end pt-14 pr-4"}>
      {!isPage ? <div className="fixed inset-0 bg-bg-overlay" onClick={onClose} /> : null}
      <div className={isPage ? "w-full" : "relative w-96 max-h-[80vh] overflow-y-auto rounded-lg border border-border-default bg-bg-surface shadow-lg"}>
        <div>
          <div className={isPage ? "mb-6 flex items-center justify-between" : "flex items-center justify-between border-b border-border-default px-4 py-4"}>
            <div>
              <Heading className={isPage ? "text-xl font-bold text-text-primary" : "text-sm font-semibold text-text-primary"}>{t(isPage ? SETTINGS_SECTION_LABELS[section] : "title")}</Heading>
            </div>
            {!isPage ? (
              <button
                type="button"
                onClick={onClose}
                className="text-text-muted hover:text-text-primary text-lg"
              >
                &times;
              </button>
            ) : null}
          </div>

        {/* 외관 설정 */}
        {(!isPage || section === "appearance") && (
          <div id="appearance" className={isPage ? "rounded-xl border border-border-default bg-bg-surface p-5" : "p-4 border-b border-border-default"}>
            {!isPage && <div className="mb-4"><LanguageSelector /></div>}
            {!isPage && <h3 className="text-xs text-text-muted uppercase tracking-wide mb-3">
              {t("appearanceSection")}
            </h3>}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-sm text-text-primary">{t("themePreference")}</span>
                <p className="text-xs text-text-muted mt-0.5">{t("themePreferenceDescription")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-border-default bg-bg-page p-1">
                {[
                  { value: "system" as const, colorDot: undefined as string | undefined },
                  { value: "dark" as const, colorDot: "#090a0d" },
                  { value: "light" as const, colorDot: "#ffffff" },
                  { value: "dracula" as const, colorDot: "#bd93f9" },
                  { value: "one-dark" as const, colorDot: "#61afef" },
                  { value: "catppuccin-mocha" as const, colorDot: "#cba6f7" },
                ].map(({ value, colorDot }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleThemePreferenceChange(value)}
                    disabled={isPending}
                    className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors ${
                      localThemePreference === value
                        ? "bg-bg-surface text-text-primary shadow-xs"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {colorDot ? (
                      <span
                        className="h-2 w-2 rounded-full border border-border-strong shrink-0"
                        style={{ backgroundColor: colorDot }}
                        aria-hidden="true"
                      />
                    ) : null}
                    {t(`theme.${value}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AI 계정 관리 링크 */}
        {!isPage && (
          <div className="p-4 border-b border-border-default">
            <Link
              href="/ai-accounts"
              prefetch={false}
              className="flex items-center justify-between w-full px-3 py-2 text-sm bg-bg-page border border-border-default rounded-md text-text-primary hover:border-brand-primary transition-colors"
            >
              <span>{t("aiAccountsLink")}</span>
              <span className="text-text-muted">&rarr;</span>
            </Link>
          </div>
        )}

        {/* Pane 레이아웃 설정 링크 */}
        {!isPage && (
          <div className="p-4 border-b border-border-default">
            <Link
              href="/pane-layout"
              prefetch={false}
              className="flex items-center justify-between w-full px-3 py-2 text-sm bg-bg-page border border-border-default rounded-md text-text-primary hover:border-brand-primary transition-colors"
            >
              <span>{t("paneLayoutLink")}</span>
              <span className="text-text-muted">&rarr;</span>
            </Link>
          </div>
        )}

        {/* 상세 페이지 설정 */}
        {(!isPage || section === "detail") && (
          <div id="detail" className={isPage ? "rounded-xl border border-border-default bg-bg-surface p-5" : "p-4 border-b border-border-default"}>
            {!isPage && <h3 className="text-xs text-text-muted uppercase tracking-wide mb-3">
              {t("detailPageSection")}
            </h3>}
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm text-text-primary">{t("sidebarDefaultCollapsed")}</span>
                <p className="text-xs text-text-muted mt-0.5">{t("sidebarDefaultCollapsedDescription")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={localSidebarDefaultCollapsed}
                onClick={() => {
                  const nextCollapsed = !localSidebarDefaultCollapsed;
                  setLocalSidebarDefaultCollapsed(nextCollapsed);
                  startTransition(async () => {
                    await setSidebarDefaultCollapsed(nextCollapsed);
                  });
                }}
                disabled={isPending}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  localSidebarDefaultCollapsed ? "bg-brand-primary" : "bg-border-default"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    localSidebarDefaultCollapsed ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          </div>
        )}

        {/* 작업 생성 설정 */}
        {(!isPage || section === "creation") && (
          <div id="creation" className={isPage ? "rounded-xl border border-border-default bg-bg-surface p-5" : "p-4 border-b border-border-default"}>
            {!isPage && <h3 className="text-xs text-text-muted uppercase tracking-wide mb-3">
              {t("taskCreationSection")}
            </h3>}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-text-primary">{t("defaultSessionType")}</span>
                <p className="text-xs text-text-muted mt-0.5">{t("defaultSessionTypeDescription")}</p>
              </div>
              <select
                value={selectedDefaultSessionType}
                onChange={(e) => {
                  const nextSessionType = e.target.value as SessionType;
                  setSelectedDefaultSessionType(nextSessionType);
                  startTransition(async () => {
                    await setDefaultSessionType(nextSessionType);
                    onDefaultSessionTypeChange?.(nextSessionType);
                  });
                }}
                disabled={isPending}
                className="px-2 py-1 text-sm bg-bg-page border border-border-default rounded-md text-text-primary focus:outline-none focus:border-brand-primary transition-colors"
              >
                <SessionTypeOptions />
              </select>
            </div>
          </div>
        )}

        {/* 알림 설정 */}
        {(!isPage || section === "notifications") && (
          <div id="notifications" className={isPage ? "rounded-xl border border-border-default bg-bg-surface p-5" : "p-4 border-b border-border-default"}>
            {!isPage && <h3 className="text-xs text-text-muted uppercase tracking-wide mb-3">
              {t("notificationSection")}
            </h3>}

            {/* 전역 토글 */}
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm text-text-primary">{t("notificationEnabled")}</span>
                <p className="text-xs text-text-muted mt-0.5">{t("notificationEnabledDescription")}</p>
              </div>
              <button
                type="button"
                role="switch"
                 aria-checked={localNotificationSettings.isEnabled}
                 onClick={() => {
                   const nextEnabled = !localNotificationSettings.isEnabled;
                    const nextSettings = { ...localNotificationSettings, isEnabled: nextEnabled };
                    setLocalNotificationSettings(nextSettings);
                    setPendingNotificationSettings(nextSettings);
                    startNotificationTransition(async () => {
                      await setNotificationEnabled(nextEnabled);
                    });
                 }}
                 disabled={isNotificationPending}
                 className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                   localNotificationSettings.isEnabled ? "bg-brand-primary" : "bg-border-default"
                 }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    localNotificationSettings.isEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            {/* 상태별 필터 — 칩 토글 */}
            <div className={`mt-4 ${!localNotificationSettings.isEnabled ? "opacity-40 pointer-events-none" : ""}`}>
              <div className="mb-2">
                <span className="text-sm text-text-primary">{t("notificationStatusFilter")}</span>
                <p className="text-xs text-text-muted mt-0.5">{t("notificationStatusFilterDescription")}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map(({ value, labelKey }) => {
                  const isSelected = localNotificationSettings.enabledStatuses.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={isNotificationPending}
                      onClick={() => {
                        const nextStatuses = isSelected
                          ? localNotificationSettings.enabledStatuses.filter((s) => s !== value)
                          : [...localNotificationSettings.enabledStatuses, value];
                        const nextSettings = { ...localNotificationSettings, enabledStatuses: nextStatuses };
                        setLocalNotificationSettings(nextSettings);
                        setPendingNotificationSettings(nextSettings);
                        startNotificationTransition(async () => {
                          await setNotificationStatuses(nextStatuses);
                        });
                      }}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        isSelected
                          ? "bg-brand-primary/15 border-brand-primary text-brand-primary"
                          : "bg-bg-page border-border-default text-text-muted hover:border-border-strong"
                      }`}
                    >
                      {tb(labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 백그라운드 Sync 설정 */}
        {(!isPage || section === "background-sync") && (
          <div id="background-sync" className={isPage ? "rounded-xl border border-border-default bg-bg-surface p-5" : "p-4 border-b border-border-default"}>
            {!isPage && <h3 className="text-xs text-text-muted uppercase tracking-wide mb-3">
              {t("backgroundSyncSection")}
            </h3>}

            {/* 활성화 토글 */}
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm text-text-primary">{t("backgroundSyncEnabled")}</span>
                <p className="text-xs text-text-muted mt-0.5">{t("backgroundSyncEnabledDescription")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={localBackgroundSyncSettings.isEnabled}
                onClick={() => {
                  const nextEnabled = !localBackgroundSyncSettings.isEnabled;
                  const nextSettings = { ...localBackgroundSyncSettings, isEnabled: nextEnabled };
                  setLocalBackgroundSyncSettings(nextSettings);
                  setPendingBackgroundSyncSettings(nextSettings);
                  startTransition(async () => {
                    await setBackgroundSyncEnabled(nextEnabled);
                  });
                }}
                disabled={isPending}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  localBackgroundSyncSettings.isEnabled ? "bg-brand-primary" : "bg-border-default"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    localBackgroundSyncSettings.isEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            {/* 주기 입력 */}
            <div className={`mt-4 flex items-center justify-between ${!localBackgroundSyncSettings.isEnabled ? "opacity-40 pointer-events-none" : ""}`}>
              <div>
                <span className="text-sm text-text-primary">{t("backgroundSyncInterval")}</span>
                <p className="text-xs text-text-muted mt-0.5">{t("backgroundSyncIntervalDescription")}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={MIN_SYNC_INTERVAL_MINUTES}
                  max={MAX_SYNC_INTERVAL_MINUTES}
                  step={1}
                  inputMode="numeric"
                  value={backgroundSyncIntervalInputValue}
                  disabled={!localBackgroundSyncSettings.isEnabled}
                  onChange={(e) => {
                    const nextInputValue = e.target.value;
                    setBackgroundSyncIntervalInputValue(nextInputValue);

                    const minutes = parseSyncIntervalMinutes(nextInputValue);
                    if (minutes === null) return;

                    const nextIntervalMs = minutes * 60_000;
                    if (nextIntervalMs === localBackgroundSyncSettings.intervalMs) return;

                    const nextSettings = { ...localBackgroundSyncSettings, intervalMs: nextIntervalMs };
                    setLocalBackgroundSyncSettings(nextSettings);
                    setPendingBackgroundSyncSettings(nextSettings);
                    startTransition(async () => {
                      await saveBackgroundSyncIntervalMs(nextIntervalMs);
                    });
                  }}
                  onBlur={() => {
                    if (parseSyncIntervalMinutes(backgroundSyncIntervalInputValue) === null) {
                      setBackgroundSyncIntervalInputValue(formatSyncIntervalMinutes(localBackgroundSyncSettings.intervalMs));
                    }
                  }}
                  className="w-20 px-2 py-1 text-sm bg-bg-page border border-border-default rounded-md text-text-primary text-right focus:outline-none focus:border-brand-primary transition-colors disabled:opacity-50"
                />
                <span className="text-sm text-text-muted">{t("backgroundSyncIntervalUnit")}</span>
              </div>
            </div>
          </div>
        )}

        {/* 키보드 설정 */}
        {(!isPage || section === "keyboard") && (
          <div id="keyboard" className={isPage ? "rounded-xl border border-border-default bg-bg-surface p-5" : "p-4 border-b border-border-default"}>
            {!isPage && <h3 className="text-xs text-text-muted uppercase tracking-wide mb-3">
              {t("keyboardSection")}
            </h3>}
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm text-text-primary">{t("vimModeEnabled")}</span>
                <p className="text-xs text-text-muted mt-0.5">{t("vimModeEnabledDescription")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label={t("vimModeEnabled")}
                aria-checked={localVimModeEnabled}
                onClick={() => {
                  const nextEnabled = !localVimModeEnabled;
                  setLocalVimModeEnabled(nextEnabled);
                  onVimModeEnabledChange?.(nextEnabled);
                  startTransition(async () => {
                    await setVimModeEnabled(nextEnabled);
                  });
                }}
                disabled={isPending}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  localVimModeEnabled ? "bg-brand-primary" : "bg-border-default"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    localVimModeEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            <Link
              href="/settings/shortcuts"
              prefetch={false}
              className="mt-4 flex items-center justify-between w-full px-3 py-2 text-sm bg-bg-page border border-border-default rounded-md text-text-primary hover:border-brand-primary transition-colors"
            >
              <span>{t("shortcutsLink")}</span>
              <span className="text-text-muted">&rarr;</span>
            </Link>
          </div>
        )}

        </div>
      </div>
    </div>
  );
}
