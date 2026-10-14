import {
  getBoardProjectFilter,
  getBoardTaskKindFilter,
  getBoardView,
  getRecentTaskIds,
  recordRecentTaskId,
  setBoardProjectFilter,
  setBoardTaskKindFilter,
  setBoardView,
} from "@/desktop/renderer/actions/appSettings";
import type {
  BoardViewPreference,
  TaskKindFilterPreference,
} from "@/desktop/main/services/appSettingsService";

export type BoardView = BoardViewPreference;
export type BoardTaskKindFilter = TaskKindFilterPreference;

const DEFAULT_BOARD_VIEW: BoardView = "dashboard";
const DEFAULT_TASK_KIND_FILTER: BoardTaskKindFilter = "all";

/**
 * 보드 화면·필터·MRU의 renderer 캐시. AppSettings는 IPC로만 닿아 동기 초기값을 줄 수 없으므로,
 * 이 모듈이 세션 동안의 값 노출을 맡고 저장은 백그라운드로 따라간다.
 * Test 격리를 위해 resetBoardPreferenceCaches()로 비운다.
 */
let boardViewCache: BoardView | null;
let boardProjectFilterCache: string[] | null;
let boardTaskKindFilterCache: BoardTaskKindFilter | null;
let recentTaskIdsCache: string[] | null;
let boardViewLoad: Promise<BoardView> | null;
let boardProjectFilterLoad: Promise<string[]> | null;
let boardTaskKindFilterLoad: Promise<BoardTaskKindFilter> | null;
let recentTaskIdsLoad: Promise<string[]> | null;

export function resetBoardPreferenceCaches(): void {
  boardViewCache = null;
  boardProjectFilterCache = null;
  boardTaskKindFilterCache = null;
  recentTaskIdsCache = null;
  boardViewLoad = null;
  boardProjectFilterLoad = null;
  boardTaskKindFilterLoad = null;
  recentTaskIdsLoad = null;
}

resetBoardPreferenceCaches();

function swallowPreferenceError(makePromise: () => Promise<unknown>, scope: string): void {
  let pending: Promise<unknown>;

  try {
    pending = makePromise();
  } catch (error) {
    // kanvibeDesktop이 없는 테스트·브라우저 환경에서도 화면 동작을 막지 않는다
    console.error("보드 설정을 저장하지 못했습니다:", scope, error);
    return;
  }

  void pending.catch((error) => {
    console.error("보드 설정을 저장하지 못했습니다:", scope, error);
  });
}

/**
 * AppSettings 조회도 kanvibeDesktop 없는 환경에서 동기로 던질 수 있어 기본값으로 떨어진다.
 * 한 키의 조회는 다른 키의 mock 여부와 무관하게 동작해야 한다.
 */
function safeLoadPreference<T>(makePromise: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return makePromise().catch(() => fallback);
  } catch {
    return Promise.resolve(fallback);
  }
}

/** 캐시에 값이 있으면 바로, 없으면 기본값으로 시작한다. 첫 렌더에서 IPC를 기다리지 않는다 */
export function peekBoardView(): BoardView {
  return boardViewCache ?? DEFAULT_BOARD_VIEW;
}

/** AppSettings의 보드 화면 값을 비동기로 읽어 캐시에 채운다 */
export function hydrateBoardView(): Promise<BoardView> {
  if (!boardViewLoad) {
    boardViewLoad = safeLoadPreference(
      () => getBoardView().then((stored) => stored ?? DEFAULT_BOARD_VIEW),
      DEFAULT_BOARD_VIEW,
    ).then((nextView) => {
      boardViewCache = nextView;
      return nextView;
    });
  }

  return boardViewLoad;
}

/** 보드 화면을 캐시에 반영하고 저장은 백그라운드로 따라간다 */
export function persistBoardView(view: BoardView): void {
  boardViewCache = view;
  swallowPreferenceError(() => setBoardView(view), "board_view");
}

/** 캐시에 프로젝트 필터가 있으면 바로, 없으면 빈 선택으로 시작한다 */
export function peekBoardProjectFilter(): string[] {
  return boardProjectFilterCache ?? [];
}

/** AppSettings의 프로젝트 필터를 비동기로 읽어 캐시에 채운다 */
export function hydrateBoardProjectFilter(): Promise<string[]> {
  if (!boardProjectFilterLoad) {
    boardProjectFilterLoad = safeLoadPreference(() => getBoardProjectFilter(), [] as string[]).then(
      (stored) => {
        boardProjectFilterCache = stored;
        return stored;
      },
    );
  }

  return boardProjectFilterLoad;
}

/** 프로젝트 필터를 캐시에 반영하고 저장은 백그라운드로 따라간다 */
export function persistBoardProjectFilter(projectIds: string[]): void {
  boardProjectFilterCache = projectIds;
  swallowPreferenceError(() => setBoardProjectFilter(projectIds), "board_project_filter");
}

/** 캐시에 작업 종류 필터가 있으면 바로, 없으면 기본값으로 시작한다 */
export function peekBoardTaskKindFilter(): BoardTaskKindFilter {
  return boardTaskKindFilterCache ?? DEFAULT_TASK_KIND_FILTER;
}

/** AppSettings의 작업 종류 필터를 비동기로 읽어 캐시에 채운다 */
export function hydrateBoardTaskKindFilter(): Promise<BoardTaskKindFilter> {
  if (!boardTaskKindFilterLoad) {
    boardTaskKindFilterLoad = safeLoadPreference(
      () => getBoardTaskKindFilter().then((stored) => stored ?? DEFAULT_TASK_KIND_FILTER),
      DEFAULT_TASK_KIND_FILTER,
    ).then((nextFilter) => {
      boardTaskKindFilterCache = nextFilter;
      return nextFilter;
    });
  }

  return boardTaskKindFilterLoad;
}

/** 작업 종류 필터를 캐시에 반영하고 저장은 백그라운드로 따라간다 */
export function persistBoardTaskKindFilter(filter: BoardTaskKindFilter): void {
  boardTaskKindFilterCache = filter;
  swallowPreferenceError(() => setBoardTaskKindFilter(filter), "board_task_kind_filter");
}

/** 캐시에 MRU가 있으면 바로, 없으면 빈 목록으로 시작한다 */
export function peekRecentTaskIds(): string[] {
  return recentTaskIdsCache ?? [];
}

/** AppSettings의 MRU 목록을 비동기로 읽어 캐시에 채운다 */
export function hydrateRecentTaskIds(): Promise<string[]> {
  if (!recentTaskIdsLoad) {
    recentTaskIdsLoad = safeLoadPreference(() => getRecentTaskIds(), [] as string[]).then(
      (stored) => {
        recentTaskIdsCache = stored;
        return stored;
      },
    );
  }

  return recentTaskIdsLoad;
}

/**
 * 연 태스크를 MRU 캐시 맨 앞으로 올리고 저장은 백그라운드로 따라간다.
 * navigateToTaskDetail()에서 호출하며, 저장 실패는 흐름을 막지 않는다.
 */
export function recordRecentTask(taskId: string): void {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) {
    return;
  }

  const storedIds = recentTaskIdsCache ?? [];
  recentTaskIdsCache = [normalizedTaskId, ...storedIds.filter((id) => id !== normalizedTaskId)];
  swallowPreferenceError(() => recordRecentTaskId(normalizedTaskId), "recent_task_ids");
}
