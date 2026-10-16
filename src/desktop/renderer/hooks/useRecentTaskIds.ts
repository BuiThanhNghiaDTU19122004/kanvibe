import { useCallback, useEffect, useState } from "react";
import {
  hydrateRecentTaskIds,
  peekRecentTaskIds,
} from "@/desktop/renderer/utils/boardPreferences";

/**
 * 최근 연 태스크 id 목록(MRU)을 읽고 기록한다. 빠른 검색의 빈 검색어 정렬이 이 목록을 쓴다.
 * 앱을 껐다 켜도 유지되어야 하므로 앱 설정 계층에 둔다.
 */
export function useRecentTaskIds() {
  const [taskIds, setTaskIds] = useState<string[]>(() => peekRecentTaskIds());

  useEffect(() => {
    let isSubscribed = true;

    hydrateRecentTaskIds()
      .then((stored) => {
        if (isSubscribed) setTaskIds(stored);
      })
      .catch((error) => {
        console.error("최근 태스크 목록을 불러오지 못했습니다:", error);
      });

    return () => {
      isSubscribed = false;
    };
  }, []);

  const refresh = useCallback(() => {
    hydrateRecentTaskIds()
      .then((stored) => {
        setTaskIds(stored);
      })
      .catch((error) => {
        console.error("최근 태스크 목록을 불러오지 못했습니다:", error);
      });
  }, []);

  return [taskIds, refresh] as const;
}