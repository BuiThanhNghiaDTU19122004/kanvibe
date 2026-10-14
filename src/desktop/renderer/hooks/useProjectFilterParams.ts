import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  hydrateBoardProjectFilter,
  persistBoardProjectFilter,
} from "@/desktop/renderer/utils/boardPreferences";

const QUERY_PARAM_KEY = "projects";

/**
 * 보드 프로젝트 필터 선택을 URL 파라미터로 들고, 앱을 껐다 켜도 유지되어야 하므로
 * AppSettings(앱 설정 계층)에 둔다. QUERY에 값이 있으면 그 값을 쓰고, 없으면 저장값을 복원한다.
 * 저장은 화면 반영과 분리해 낙관적으로 진행하고, 실패해도 이번 세션의 선택은 그대로 유지한다.
 */
export function useProjectFilterParams(validProjectIds: string[]) {
  const validIdSet = useMemo(() => new Set(validProjectIds), [validProjectIds]);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProjectIds = useMemo(() => {
    const param = searchParams.get(QUERY_PARAM_KEY);
    if (!param) {
      return [];
    }

    return param.split(",").filter((id) => validIdSet.has(id));
  }, [searchParams, validIdSet]);

  useEffect(() => {
    const param = searchParams.get(QUERY_PARAM_KEY);
    if (param) {
      persistBoardProjectFilter(param.split(",").filter((id) => validIdSet.has(id)));
      return;
    }

    let isSubscribed = true;

    hydrateBoardProjectFilter()
      .then((stored) => {
        if (!isSubscribed) {
          return;
        }

        const restored = stored.filter((id) => validIdSet.has(id));
        if (restored.length > 0) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set(QUERY_PARAM_KEY, restored.join(","));
          setSearchParams(nextParams, { replace: true });
        }
      })
      .catch((error) => {
        console.error("프로젝트 필터를 불러오지 못했습니다:", error);
      });

    return () => {
      isSubscribed = false;
    };
  }, [searchParams, setSearchParams, validIdSet]);

  const setSelectedProjectIds = (idsOrUpdater: string[] | ((prev: string[]) => string[])) => {
    const nextIds = typeof idsOrUpdater === "function" ? idsOrUpdater(selectedProjectIds) : idsOrUpdater;
    persistBoardProjectFilter(nextIds);

    const nextParams = new URLSearchParams(searchParams);
    if (nextIds.length > 0) {
      nextParams.set(QUERY_PARAM_KEY, nextIds.join(","));
    } else {
      nextParams.delete(QUERY_PARAM_KEY);
    }
    setSearchParams(nextParams, { replace: true });
  };

  return [selectedProjectIds, setSelectedProjectIds] as const;
}
