import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  hydrateBoardTaskKindFilter,
  persistBoardTaskKindFilter,
  type BoardTaskKindFilter,
} from "@/desktop/renderer/utils/boardPreferences";

export const TASK_KIND_FILTER_VALUES = ["project", "task", "all"] as const;
export type TaskKindFilter = typeof TASK_KIND_FILTER_VALUES[number];

const QUERY_PARAM_KEY = "taskKind";
const DEFAULT_TASK_KIND_FILTER: TaskKindFilter = "all";

function normalizeTaskKindFilter(value: string | null): TaskKindFilter {
  if (value && TASK_KIND_FILTER_VALUES.includes(value as TaskKindFilter)) {
    return value as TaskKindFilter;
  }

  return DEFAULT_TASK_KIND_FILTER;
}

/**
 * 작업 종류 필터를 URL 파라미터로 들고, 앱을 껐다 켜도 유지되어야 하므로
 * AppSettings(앱 설정 계층)에 둔다. QUERY에 값이 있으면 그 값을 쓰고, 없으면 저장값을 복원한다.
 * 저장은 화면 반영과 분리해 낙관적으로 진행하고, 실패해도 이번 세션의 선택은 그대로 유지한다.
 */
export function useTaskKindFilterParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramValue = searchParams.get(QUERY_PARAM_KEY);
  const taskKindFilter = useMemo(
    () => normalizeTaskKindFilter(paramValue),
    [paramValue],
  );

  useEffect(() => {
    if (paramValue) {
      const normalizedParam = normalizeTaskKindFilter(paramValue);
      if (normalizedParam !== paramValue) {
        // 저장된 필터를 함께 기본값으로 되돌린다. 지우지 않으면 query를 제거한 다음 렌더에서
        // 세션 복원이 일어나 잘못된 값으로 진입한 사용자가 이전 필터로 끌려간다.
        persistBoardTaskKindFilter(normalizedParam);

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete(QUERY_PARAM_KEY);
        setSearchParams(nextParams, { replace: true });
        return;
      }

      persistBoardTaskKindFilter(normalizedParam);
      return;
    }

    let isSubscribed = true;

    hydrateBoardTaskKindFilter()
      .then((stored: BoardTaskKindFilter) => {
        if (!isSubscribed) {
          return;
        }

        const restored = normalizeTaskKindFilter(stored);
        if (restored !== DEFAULT_TASK_KIND_FILTER) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set(QUERY_PARAM_KEY, restored);
          setSearchParams(nextParams, { replace: true });
        }
      })
      .catch((error) => {
        console.error("작업 종류 필터를 불러오지 못했습니다:", error);
      });

    return () => {
      isSubscribed = false;
    };
  }, [paramValue, searchParams, setSearchParams]);

  const setTaskKindFilter = (filter: TaskKindFilter) => {
    persistBoardTaskKindFilter(filter);

    const nextParams = new URLSearchParams(searchParams);
    if (filter === DEFAULT_TASK_KIND_FILTER) {
      nextParams.delete(QUERY_PARAM_KEY);
    } else {
      nextParams.set(QUERY_PARAM_KEY, filter);
    }
    setSearchParams(nextParams, { replace: true });
  };

  return [taskKindFilter, setTaskKindFilter] as const;
}
