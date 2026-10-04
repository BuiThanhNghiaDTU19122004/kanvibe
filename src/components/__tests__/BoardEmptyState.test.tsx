import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      emptyBoardTitle: "No tasks yet",
      emptyBoardDescription: "Create your first task with an AI coding agent or scan more Git repositories.",
      noProjectsTitle: "Welcome to KanVibe",
      noProjectsDescription: "Get started by scanning and registering a Git repository on this machine.",
      newTask: "+ New Task",
      scanFirstProject: "Scan Git Repositories",
      scanMoreProjects: "Scan More Projects",
    };
    return messages[key] ?? key;
  },
}));

import BoardEmptyState from "../BoardEmptyState";

describe("BoardEmptyState", () => {
  const onNewTask = vi.fn();
  const onScanProjects = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders empty state with new task CTA when projects exist", () => {
    render(
      <BoardEmptyState
        onNewTask={onNewTask}
        onScanProjects={onScanProjects}
        hasProjects={true}
      />,
    );

    expect(screen.getByTestId("board-empty-state")).toBeTruthy();
    expect(screen.getByText("No tasks yet")).toBeTruthy();

    const newTaskBtn = screen.getByTestId("empty-state-new-task-btn");
    expect(newTaskBtn).toBeTruthy();
    fireEvent.click(newTaskBtn);
    expect(onNewTask).toHaveBeenCalledTimes(1);

    const scanBtn = screen.getByTestId("empty-state-scan-btn");
    fireEvent.click(scanBtn);
    expect(onScanProjects).toHaveBeenCalledTimes(1);
  });

  it("renders welcome message when no projects exist yet", () => {
    render(
      <BoardEmptyState
        onNewTask={onNewTask}
        onScanProjects={onScanProjects}
        hasProjects={false}
      />,
    );

    expect(screen.getByText("Welcome to KanVibe")).toBeTruthy();
    expect(screen.queryByTestId("empty-state-new-task-btn")).toBeNull();

    const scanBtn = screen.getByTestId("empty-state-scan-btn");
    expect(scanBtn.textContent).toContain("Scan Git Repositories");
    fireEvent.click(scanBtn);
    expect(onScanProjects).toHaveBeenCalledTimes(1);
  });
});
