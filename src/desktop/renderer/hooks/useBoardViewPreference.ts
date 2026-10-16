import { useCallback, useEffect, useState } from "react";
import {
  hydrateBoardView,
  peekBoardView,
  persistBoardView,
  type BoardView,
} from "@/desktop/renderer/utils/boardPreferences";

/**
 * 보드 화면(칸반/대시보드) 선택을 AppSettings에 둔다.
 * 앱을 껐다 켜도 유지되어야 하므로 route cache·sessionStorage가 아니라 앱 설정 계층을 쓴다.
 * 저장 화면 반영과 분리해 낙관적으로 진행하고, 실패해도 이번 세션의 화면은 그대로 유지한다.
 */
export function useBoardViewPreference() {
  const [view, setView] = useState<BoardView>(() => peekBoardView());

  useEffect(() => {
    let isSubscribed = true;

    hydrateBoardView()
      .then((stored) => {
        if (isSubscribed) setView(stored);
      })
      .catch((error) => {
        console.error("보드 화면 설정을 불러오지 못했습니다:", error);
      });

    return () => {
      isSubscribed = false;
    };
  }, []);

  const updateView = useCallback((next: BoardView) => {
    setView(next);
    persistBoardView(next);
  }, []);

  return [view, updateView] as const;
}