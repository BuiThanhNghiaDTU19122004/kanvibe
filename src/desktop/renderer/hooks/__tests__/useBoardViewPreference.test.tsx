import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetBoardPreferenceCaches } from "@/desktop/renderer/utils/boardPreferences";
import { useBoardViewPreference } from "../useBoardViewPreference";

vi.mock("@/desktop/renderer/actions/appSettings", () => ({
  setBoardView: vi.fn(async () => undefined),
}));

function BoardViewHarness() {
  const [view, setView] = useBoardViewPreference();

  return (
    <div>
      <div data-testid="view">{view}</div>
      <button type="button" onClick={() => setView("kanban")}>kanban</button>
      <button type="button" onClick={() => setView("dashboard")}>dashboard</button>
    </div>
  );
}

describe("useBoardViewPreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBoardPreferenceCaches();
  });

  it("기본값 dashboard로 시작하고 변경하면 캐시에 반영한다", () => {
    render(
      <MemoryRouter>
        <BoardViewHarness />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("view").textContent).toBe("dashboard");

    fireEvent.click(screen.getByRole("button", { name: "kanban" }));
    expect(screen.getByTestId("view").textContent).toBe("kanban");

    fireEvent.click(screen.getByRole("button", { name: "dashboard" }));
    expect(screen.getByTestId("view").textContent).toBe("dashboard");
  });
});