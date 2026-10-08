import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslations } from "next-intl";
import ProjectSettings from "@/components/ProjectSettings";
import LoadError from "@/components/LoadError";
import {
  getBackgroundSyncSettings, getDefaultSessionType, getNotificationSettings,
  getSidebarDefaultCollapsed, getThemePreference, getVimModeEnabled,
  type ThemePreference,
} from "@/desktop/renderer/actions/appSettings";
import { SessionType } from "@/entities/KanbanTask";
import { SETTINGS_SECTIONS, SETTINGS_SECTION_LABELS, type SettingsSection } from "@/desktop/shared/settingsSections";
import { useRefreshSignal } from "@/desktop/renderer/utils/refresh";
import { INITIAL_DESKTOP_LOAD_TIMEOUT_MS, logDesktopInitialLoadTimeout } from "@/desktop/renderer/utils/loadingTimeout";

interface SettingsData {
  section: SettingsSection;
  sidebarDefaultCollapsed: boolean;
  notificationSettings: Awaited<ReturnType<typeof getNotificationSettings>>;
  defaultSessionType: SessionType;
  vimModeEnabled: boolean;
  themePreference: ThemePreference;
  backgroundSyncSettings: Awaited<ReturnType<typeof getBackgroundSyncSettings>>;
}

// Only read the setting used by this page. Projects and SSH hosts are unrelated.
async function loadSection(section: SettingsSection): Promise<SettingsData> {
  const data: SettingsData = {
    section, sidebarDefaultCollapsed: false, defaultSessionType: SessionType.TERMINAL,
    vimModeEnabled: true, themePreference: "system",
    notificationSettings: { isEnabled: false, enabledStatuses: [] },
    backgroundSyncSettings: { isEnabled: false, intervalMs: 600_000 },
  };
  switch (section) {
    case "appearance": data.themePreference = await getThemePreference(); break;
    case "detail": data.sidebarDefaultCollapsed = await getSidebarDefaultCollapsed(); break;
    case "creation": data.defaultSessionType = await getDefaultSessionType(); break;
    case "notifications": data.notificationSettings = await getNotificationSettings(); break;
    case "background-sync": data.backgroundSyncSettings = await getBackgroundSyncSettings(); break;
    case "keyboard": data.vimModeEnabled = await getVimModeEnabled(); break;
  }
  return data;
}

export default function SettingsRoute() {
  const { section: sectionParam = "appearance" } = useParams();
  const section = SETTINGS_SECTIONS.find((value) => value === sectionParam);
  const refreshSignal = useRefreshSignal(["all", "settings"]);
  const [data, setData] = useState<SettingsData | null>(null);
  const t = useTranslations("common");
  const ts = useTranslations("settings");
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const retry = () => { setLoadFailed(false); setRetryKey((key) => key + 1); };

  useEffect(() => {
    if (section) document.title = ts(SETTINGS_SECTION_LABELS[section]);
  }, [section, ts]);

  useEffect(() => {
    if (!section) return;
    let cancelled = false;
    setLoadFailed(false);
    const loadingTimeout = window.setTimeout(() => {
      if (!cancelled) {
        logDesktopInitialLoadTimeout(`settings/${section}`);
        setLoadFailed(true);
      }
    }, INITIAL_DESKTOP_LOAD_TIMEOUT_MS);
    void loadSection(section).then((nextData) => {
      window.clearTimeout(loadingTimeout);
      if (!cancelled) { setData(nextData); setLoadFailed(false); }
    }).catch((error) => {
      window.clearTimeout(loadingTimeout);
      console.error("Failed to load settings page:", error);
      if (!cancelled) setLoadFailed(true);
    });
    return () => { cancelled = true; window.clearTimeout(loadingTimeout); };
  }, [section, refreshSignal, retryKey]);

  if (!section) return <Navigate to="../appearance" replace />;
  if (!data || data.section !== section) {
    return loadFailed ? <LoadError onRetry={retry} /> : <div className="flex min-h-48 items-center justify-center text-text-muted">{t("loading")}</div>;
  }
  return (
    <>
      {loadFailed && <LoadError inline onRetry={retry} />}
      <ProjectSettings key={section} isOpen variant="page" section={section}
        sidebarDefaultCollapsed={data.sidebarDefaultCollapsed}
        defaultSessionType={data.defaultSessionType}
        vimModeEnabled={data.vimModeEnabled}
        themePreference={data.themePreference}
        onDefaultSessionTypeChange={(defaultSessionType) => setData((current) => current ? { ...current, defaultSessionType } : current)}
        onThemePreferenceChange={(themePreference) => setData((current) => current ? { ...current, themePreference } : current)}
        onVimModeEnabledChange={(vimModeEnabled) => setData((current) => current ? { ...current, vimModeEnabled } : current)}
        notificationSettings={data.notificationSettings}
        backgroundSyncSettings={data.backgroundSyncSettings}
      />
    </>
  );
}
