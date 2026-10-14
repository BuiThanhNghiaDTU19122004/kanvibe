import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetBoardPreferenceCaches } from "@/desktop/renderer/utils/boardPreferences";
import { useRecentTaskIds } from "../useRecentTaskIds";

vi.mock("@/desktop/renderer/actions/appSettings", () => ({
  getRecentTaskIds: vi.fn(async () => ["task-b", "task-a"]),
}));

function RecentTaskIdsHarness() {
  const [taskIds] = useRecentTaskIds();

  return <div data-testid="recent">{taskIds.join(",")}</div>;
}

describe("useRecentTaskIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBoardPreferenceCaches();
  });

  it("저장된 MRU 목록을 비동기로 읽어 보여 준다", async () => {
    render(
      <MemoryRouter>
        <RecentTaskIdsHarness />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("recent").textContent).toBe("task-b,task-a");
    });
  });
});