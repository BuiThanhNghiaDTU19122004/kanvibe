import { useCallback, useEffect, useState } from "react";
import { useIsWindowActive } from "@/desktop/renderer/hooks/useIsWindowActive";

/**
 * 조회 결과를 주기적으로 새로 읽는다.
 * 앞선 조회가 아직 안 끝났으면 건너뛰어, 원격처럼 느린 호출에서 요청이 쌓이지 않게 한다.
 *
 * 창이 가려져 있으면 주기 조회는 멈추되 첫 조회는 한 번 한다.
 * 그래야 창이 다시 앞으로 나왔을 때 빈 화면부터 보여주지 않는다.
 */
export function usePolledResource<T>(
  read: () => Promise<T>,
  emptyValue: T,
  intervalMs: number,
  isEnabled: boolean,
) {
  const [resource, setResource] = useState({ value: emptyValue, error: false, updatedAt: null as string | null });
  const [retryKey, setRetryKey] = useState(0);
  const retry = useCallback(() => setRetryKey((key) => key + 1), []);
  const isWindowActive = useIsWindowActive();

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    let isCancelled = false;
    let isReading = false;

    const readOnce = async () => {
      if (isReading) {
        return;
      }

      isReading = true;
      try {
        const nextValue = await read();
        if (!isCancelled) {
          setResource({ value: nextValue, error: false, updatedAt: new Date().toISOString() });
        }
      } catch {
        if (!isCancelled) setResource((current) => ({ ...current, error: true }));
      } finally {
        isReading = false;
      }
    };

    void readOnce();

    if (!isWindowActive) {
      return () => {
        isCancelled = true;
      };
    }

    const pollIntervalId = window.setInterval(() => {
      void readOnce();
    }, intervalMs);

    return () => {
      isCancelled = true;
      window.clearInterval(pollIntervalId);
    };
  }, [intervalMs, isEnabled, isWindowActive, read, retryKey]);

  return { ...resource, retry };
}

export function usePolledValue<T>(read: () => Promise<T>, emptyValue: T, intervalMs: number, isEnabled: boolean): T {
  return usePolledResource(read, emptyValue, intervalMs, isEnabled).value;
}
