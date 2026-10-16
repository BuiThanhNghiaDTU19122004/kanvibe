import type { SessionType } from "@/entities/KanbanTask";
import type { BoardSortPreference } from "@/desktop/shared/boardSort";
import type { ShortcutBindings } from "@/desktop/shared/shortcutBindings";
import type {
  BoardViewPreference,
  TaskKindFilterPreference,
} from "@/desktop/main/services/appSettingsService";
import { invokeDesktop } from "@/desktop/renderer/ipc";
import { triggerDesktopRefresh } from "@/desktop/renderer/utils/refresh";

export type ThemePreference = "system" | "light" | "dark" | "dracula" | "one-dark" | "catppuccin-mocha";

const THEME_PREFERENCE_KEY = "theme_preference";
const THEME_PREFERENCES = new Set<ThemePreference>([
  "system",
  "light",
  "dark",
  "dracula",
  "one-dark",
  "catppuccin-mocha",
]);

async function invokeAndRefresh<T>(method: string, ...args: unknown[]): Promise<T> {
  const result = await invokeDesktop<T>("appSettings", method, ...args);
  triggerDesktopRefresh("settings");
  return result;
}

export function getAppSetting(key: string): Promise<string | null> {
  return invokeDesktop("appSettings", "getAppSetting", key);
}

export function setAppSetting(key: string, value: string): Promise<void> {
  return invokeAndRefresh("setAppSetting", key, value);
}

export function getSidebarDefaultCollapsed(): Promise<boolean> {
  return invokeDesktop("appSettings", "getSidebarDefaultCollapsed");
}

export function setSidebarDefaultCollapsed(collapsed: boolean): Promise<void> {
  return invokeAndRefresh("setSidebarDefaultCollapsed", collapsed);
}

export function getSidebarHintDismissed(): Promise<boolean> {
  return invokeDesktop("appSettings", "getSidebarHintDismissed");
}

export function dismissSidebarHint(): Promise<void> {
  return invokeAndRefresh("dismissSidebarHint");
}

export function getDoneAlertDismissed(): Promise<boolean> {
  return invokeDesktop("appSettings", "getDoneAlertDismissed");
}

export function dismissDoneAlert(): Promise<void> {
  return invokeAndRefresh("dismissDoneAlert");
}

export function getReleaseUpdateDismissedVersions(): Promise<string[]> {
  return invokeDesktop("appSettings", "getReleaseUpdateDismissedVersions");
}

export function dismissReleaseUpdateVersion(version: string): Promise<void> {
  return invokeAndRefresh("dismissReleaseUpdateVersion", version);
}

export function getNotificationSettings(): Promise<{ isEnabled: boolean; enabledStatuses: string[] }> {
  return invokeDesktop("appSettings", "getNotificationSettings");
}

export function setNotificationEnabled(enabled: boolean): Promise<void> {
  return invokeAndRefresh("setNotificationEnabled", enabled);
}

export function setNotificationStatuses(statuses: string[]): Promise<void> {
  return invokeAndRefresh("setNotificationStatuses", statuses);
}

export function getNotificationUnreadOnlyEnabled(): Promise<boolean> {
  return invokeDesktop("appSettings", "getNotificationUnreadOnlyEnabled");
}

/** 알림 팝업이 필터 상태를 직접 들고 있으므로 설정 refresh를 태우지 않는다. 탭을 누를 때마다 화면을 다시 그리면 깜빡인다 */
export function setNotificationUnreadOnlyEnabled(enabled: boolean): Promise<void> {
  return invokeDesktop("appSettings", "setNotificationUnreadOnlyEnabled", enabled);
}

export function getDefaultSessionType(): Promise<SessionType> {
  return invokeDesktop("appSettings", "getDefaultSessionType");
}

export function setDefaultSessionType(sessionType: SessionType): Promise<void> {
  return invokeAndRefresh("setDefaultSessionType", sessionType);
}

export function getTaskSearchShortcut(): Promise<string> {
  return invokeDesktop("appSettings", "getTaskSearchShortcut");
}

export function getShortcutBindings(): Promise<ShortcutBindings> {
  return invokeDesktop("appSettings", "getShortcutBindings");
}

export function setShortcutBindings(bindings: ShortcutBindings): Promise<void> {
  return invokeAndRefresh("setShortcutBindings", bindings);
}

export function getVimModeEnabled(): Promise<boolean> {
  return invokeDesktop("appSettings", "getVimModeEnabled");
}

export function setVimModeEnabled(enabled: boolean): Promise<void> {
  return invokeAndRefresh("setVimModeEnabled", enabled);
}

export async function getBackgroundSyncSettings(): Promise<{ isEnabled: boolean; intervalMs: number }> {
  const [isEnabled, intervalMs] = await Promise.all([
    invokeDesktop<boolean>("appSettings", "getBackgroundSyncEnabled"),
    invokeDesktop<number>("appSettings", "getBackgroundSyncIntervalMs"),
  ]);
  return { isEnabled, intervalMs };
}

export function setBackgroundSyncEnabled(enabled: boolean): Promise<void> {
  return invokeAndRefresh("setBackgroundSyncEnabled", enabled);
}

export function setBackgroundSyncIntervalMs(intervalMs: number): Promise<void> {
  return invokeAndRefresh("setBackgroundSyncIntervalMs", intervalMs);
}

export function getBoardSortPreference(): Promise<BoardSortPreference> {
  return invokeDesktop("appSettings", "getBoardSortPreference");
}

/** 보드가 정렬 상태를 직접 들고 있으므로 설정 refresh를 태우지 않는다. 기준을 누를 때마다 보드를 다시 그리면 깜빡인다 */
export function setBoardSortPreference(preference: BoardSortPreference): Promise<void> {
  return invokeDesktop("appSettings", "setBoardSortPreference", preference);
}

/** 보드 화면(칸반/대시보드) 선택을 조회한다. 렌더러 훅의 캐시가 세션 안의 값 노출을 맡는다 */
export function getBoardView(): Promise<BoardViewPreference | null> {
  return invokeDesktop("appSettings", "getBoardView");
}

/** 보드 화면 선택 저장은 화면이 바뀐 뒤 백그라운드로 따라가며 설정 refresh를 태우지 않는다 */
export function setBoardView(view: BoardViewPreference): Promise<void> {
  return invokeDesktop("appSettings", "setBoardView", view);
}

/** 보드 프로젝트 필터 선택을 조회한다 */
export function getBoardProjectFilter(): Promise<string[]> {
  return invokeDesktop("appSettings", "getBoardProjectFilter");
}

/** 보드 프로젝트 필터 선택 저장은 화면이 바뀐 뒤 백그라운드로 따라가며 설정 refresh를 태우지 않는다 */
export function setBoardProjectFilter(projectIds: string[]): Promise<void> {
  return invokeDesktop("appSettings", "setBoardProjectFilter", projectIds);
}

/** 보드 작업 종류 필터를 조회한다 */
export function getBoardTaskKindFilter(): Promise<TaskKindFilterPreference | null> {
  return invokeDesktop("appSettings", "getBoardTaskKindFilter");
}

/** 보드 작업 종류 필터 저장은 화면이 바뀐 뒤 백그라운드로 따라가며 설정 refresh를 태우지 않는다 */
export function setBoardTaskKindFilter(filter: TaskKindFilterPreference): Promise<void> {
  return invokeDesktop("appSettings", "setBoardTaskKindFilter", filter);
}

/** 최근에 연 태스크 id 목록(MRU)을 조회한다. 가장 최근이 앞에 온다 */
export function getRecentTaskIds(): Promise<string[]> {
  return invokeDesktop("appSettings", "getRecentTaskIds");
}

/**
 * 태스크를 연 흔적을 MRU 목록 맨 앞으로 올린다.
 * 내비게이션 흐름을 막지 않도록 오류는 호출자가 버리고, 저장 실패해도 화면 동작에는 영향을 주지 않는다.
 */
export function recordRecentTaskId(taskId: string): Promise<void> {
  return invokeDesktop("appSettings", "recordRecentTaskId", taskId);
}

export async function getThemePreference(): Promise<ThemePreference> {
  const value = await getAppSetting(THEME_PREFERENCE_KEY);
  return THEME_PREFERENCES.has(value as ThemePreference) ? value as ThemePreference : "system";
}

export function setThemePreference(themePreference: ThemePreference): Promise<void> {
  return setAppSetting(THEME_PREFERENCE_KEY, themePreference);
}
