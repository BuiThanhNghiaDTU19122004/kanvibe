import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { resetBoardPreferenceCaches } from "@/desktop/renderer/utils/boardPreferences";
import { useTaskKindFilterParams } from "../useTaskKindFilterParams";

const boardPreferencesModuleActions = vi.hoisted(() => ({
  setBoardTaskKindFilter: vi.fn(async (..._args: unknown[]) => undefined),
  getBoardTaskKindFilter: vi.fn(async () => null as "project" | "task" | "all" | null),
}));

vi.mock("@/desktop/renderer/utils/boardPreferences", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/desktop/renderer/utils/boardPreferences")>();
  const stored: { boardTaskKindFilter: "project" | "task" | "all" | null } = {
    boardTaskKindFilter: null,
  };

  return {
    ...actual,
    hydrateBoardTaskKindFilter: async () => stored.boardTaskKindFilter ?? "all",
    persistBoardTaskKindFilter: (...args: unknown[]) => {
      const filter = args[0] as "project" | "task" | "all";
      stored.boardTaskKindFilter = filter;
      void boardPreferencesModuleActions.setBoardTaskKindFilter(filter);
    },
  };
});

function TaskKindFilterHarness() {
  const [filter, setFilter] = useTaskKindFilterParams();
  const [searchParams] = useSearchParams();

  return (
    <div>
      <div data-testid="filter">{filter}</div>
      <div data-testid="query">{searchParams.get("taskKind") ?? ""}</div>
      <button type="button" onClick={() => setFilter("project")}>project</button>
      <button type="button" onClick={() => setFilter("task")}>task</button>
      <button type="button" onClick={() => setFilter("all")}>all</button>
    </div>
  );
}

function renderHarness(initialEntry = "/ko") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TaskKindFilterHarness />
    </MemoryRouter>,
  );
}

describe("useTaskKindFilterParams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBoardPreferenceCaches();
  });

  it("taskKind query가 없으면 All을 기본값으로 사용한다", () => {
    renderHarness();

    expect(screen.getByTestId("filter").textContent).toBe("all");
    expect(screen.getByTestId("query").textContent).toBe("");
  });

  it("Project/Task 선택을 URL query에 반영하고 persist에 위임한다", async () => {
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "project" }));

    await waitFor(() => {
      expect(screen.getByTestId("filter").textContent).toBe("project");
      expect(screen.getByTestId("query").textContent).toBe("project");
    });
    expect(boardPreferencesModuleActions.setBoardTaskKindFilter).toHaveBeenCalledWith("project");

    fireEvent.click(screen.getByRole("button", { name: "task" }));

    await waitFor(() => {
      expect(screen.getByTestId("filter").textContent).toBe("task");
      expect(screen.getByTestId("query").textContent).toBe("task");
    });
    expect(boardPreferencesModuleActions.setBoardTaskKindFilter).toHaveBeenCalledWith("task");

    fireEvent.click(screen.getByRole("button", { name: "all" }));

    await waitFor(() => {
      expect(screen.getByTestId("filter").textContent).toBe("all");
      expect(screen.getByTestId("query").textContent).toBe("");
    });
    expect(boardPreferencesModuleActions.setBoardTaskKindFilter).toHaveBeenCalledWith("all");
  });

  it("query가 없으면 persist에 맡긴 저장값을 복원한다", async () => {
    const { persistBoardTaskKindFilter } = await import(
      "@/desktop/renderer/utils/boardPreferences"
    );
    persistBoardTaskKindFilter("task");

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId("filter").textContent).toBe("task");
      expect(screen.getByTestId("query").textContent).toBe("task");
    });
  });

  it("알 수 없는 query 값은 제거하고 기본값으로 되돌린다", async () => {
    renderHarness("/ko?taskKind=unknown");

    await waitFor(() => {
      expect(screen.getByTestId("filter").textContent).toBe("all");
      expect(screen.getByTestId("query").textContent).toBe("");
    });
  });

  it("알 수 없는 query 값으로 진입하면 저장값도 함께 기본값으로 되돌린다", async () => {
    const { persistBoardTaskKindFilter } = await import(
      "@/desktop/renderer/utils/boardPreferences"
    );
    persistBoardTaskKindFilter("project");

    renderHarness("/ko?taskKind=unknown");

    await waitFor(() => {
      expect(screen.getByTestId("filter").textContent).toBe("all");
      expect(screen.getByTestId("query").textContent).toBe("");
    });

    const { hydrateBoardTaskKindFilter } = await import(
      "@/desktop/renderer/utils/boardPreferences"
    );
    await expect(hydrateBoardTaskKindFilter()).resolves.toBe("all");
  });
});
