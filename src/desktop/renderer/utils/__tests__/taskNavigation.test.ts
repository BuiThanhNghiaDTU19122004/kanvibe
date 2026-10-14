import { beforeEach, describe, expect, it, vi } from "vitest";
import { peekRecentTaskIds, resetBoardPreferenceCaches } from "@/desktop/renderer/utils/boardPreferences";
import { navigateToTaskDetail } from "@/desktop/renderer/utils/taskNavigation";

describe("navigateToTaskDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBoardPreferenceCaches();
    window.history.replaceState({}, "", "/#/en");
  });

  it("focuses an existing task detail window before falling back to in-window navigation", async () => {
    const navigate = vi.fn();
    const focusExistingInternalRoute = vi.fn().mockResolvedValue(true);
    window.kanvibeDesktop = {
      isDesktop: true,
      focusExistingInternalRoute,
    } as unknown as NonNullable<typeof window.kanvibeDesktop>;

    await navigateToTaskDetail("task-1", {
      currentLocale: "en",
      navigate,
    });

    expect(focusExistingInternalRoute).toHaveBeenCalledWith("/en/task/task-1");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates in the current window when no existing task detail window is focused", async () => {
    const navigate = vi.fn();
    const focusExistingInternalRoute = vi.fn().mockResolvedValue(false);
    window.kanvibeDesktop = {
      isDesktop: true,
      focusExistingInternalRoute,
    } as unknown as NonNullable<typeof window.kanvibeDesktop>;

    await navigateToTaskDetail("task-1", {
      currentLocale: "en",
      navigate,
    });

    expect(focusExistingInternalRoute).toHaveBeenCalledWith("/en/task/task-1");
    expect(navigate).toHaveBeenCalledWith("/en/task/task-1");
  });

  it("records the opened task in the MRU cache even when navigation falls back", async () => {
    const navigate = vi.fn();
    const focusExistingInternalRoute = vi.fn().mockResolvedValue(false);
    window.kanvibeDesktop = {
      isDesktop: true,
      focusExistingInternalRoute,
    } as unknown as NonNullable<typeof window.kanvibeDesktop>;

    await navigateToTaskDetail("task-1", {
      currentLocale: "en",
      navigate,
    });

    expect(peekRecentTaskIds()).toContain("task-1");
  });

  it("records the opened task without kanvibeDesktop so MRU keeps working in plain browsers", () => {
    delete window.kanvibeDesktop;

    navigateToTaskDetail("task-1", {
      currentLocale: "en",
      navigate: () => {},
    }).catch(() => {
      // navigate 자체는 실패해도 MRU 기록이 먼저 일어나야 한다
    });

    expect(peekRecentTaskIds()).toContain("task-1");
  });
});
