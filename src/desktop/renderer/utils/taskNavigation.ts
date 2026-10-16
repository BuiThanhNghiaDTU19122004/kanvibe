import { localizeHref, redirect } from "@/desktop/renderer/navigation";
import { openInternalRouteInNewWindow } from "@/desktop/renderer/utils/windowOpen";
import { recordRecentTask } from "@/desktop/renderer/utils/boardPreferences";

interface NavigateToTaskDetailOptions {
  currentLocale?: string;
  navigate?: (href: string) => void;
  openInNewWindow?: boolean;
  searchParams?: string;
}

interface TaskNavigationClickEvent {
  defaultPrevented: boolean;
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function shouldHandleTaskNavigationClick(event: TaskNavigationClickEvent) {
  return (
    !event.defaultPrevented
    && event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
  );
}

export function getTaskDetailHref(taskId: string, currentLocale?: string, searchParams?: string) {
  const query = searchParams ? (searchParams.startsWith("?") ? searchParams : `?${searchParams}`) : "";
  return localizeHref(`/task/${taskId}${query}`, currentLocale);
}

export async function focusExistingTaskDetailWindow(taskId: string, currentLocale?: string) {
  const focusExistingInternalRoute = window.kanvibeDesktop?.focusExistingInternalRoute;
  if (!focusExistingInternalRoute) {
    return false;
  }

  try {
    return await focusExistingInternalRoute(getTaskDetailHref(taskId, currentLocale));
  } catch {
    return false;
  }
}

export async function navigateToTaskDetail(
  taskId: string,
  {
    currentLocale,
    navigate = redirect,
    openInNewWindow = false,
    searchParams,
  }: NavigateToTaskDetailOptions = {},
) {
  const href = getTaskDetailHref(taskId, currentLocale, searchParams);

  // 태스크 상세 진입은 빠른 검색 MRU 정렬의 근거가 된다. 기록 실패는 이동을 막지 않는다
  recordRecentTask(taskId);

  if (openInNewWindow) {
    openInternalRouteInNewWindow(href);
    return;
  }

  const didFocusExistingWindow = await focusExistingTaskDetailWindow(taskId, currentLocale);
  if (!didFocusExistingWindow) {
    navigate(href);
  }
}
