import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskStatus, type KanbanTask } from "@/entities/KanbanTask";
import VibeDashboardView from "../VibeDashboardView";
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const task = { id: "t1", title: "My task", status: TaskStatus.PROGRESS, worktreePath: "D:/project/worktree", updatedAt: new Date(), projectId: "p1" } as KanbanTask;
function props(status = TaskStatus.PROGRESS) { return { tasks: { todo: [], progress: [], pending: [], review: [], done: [], [status]: [{ ...task, status }] }, runningAgentPanes: [], projects: [], projectNameMap: new Map([["p1", "Project"]]), projectColorMap: new Map<string,string>(), projectIconMap: new Map<string,string|null>(), onNewTask: vi.fn(), onSelectTask: vi.fn(), monitorReadAt: "2026-10-06T10:00:00Z" }; }
describe("attention-first dashboard", () => {
  it("offers creating a task and an honest empty process state", () => { const p=props(); render(<VibeDashboardView {...p} />); expect(screen.getByTestId("empty-active-agents")).toBeTruthy(); fireEvent.click(screen.getByTestId("dashboard-new-task-btn")); expect(p.onNewTask).toHaveBeenCalled(); });
  it("shows unknown rather than zero when monitoring fails and retries", () => { const retry=vi.fn(); render(<VibeDashboardView {...props()} monitorError onRetryMonitor={retry} />); expect(screen.queryByTestId("empty-active-agents")).toBeNull(); expect(screen.getByRole("alert").textContent).toContain("monitorUnavailable"); fireEvent.click(screen.getByText("retry")); expect(retry).toHaveBeenCalled(); });
  it("pairs Windows paths case-insensitively and navigates to activity", () => { const p=props(); render(<VibeDashboardView {...p} runningAgentPanes={[{ provider: "claude", worktreePath: "d:\\PROJECT\\worktree", sessionName: "s1", windowId: "tab1", windowName: "tab" }]} />); fireEvent.click(within(screen.getByTestId("active-agent-card")).getByRole("button")); expect(p.onSelectTask).toHaveBeenCalledWith("t1"); });
  it.each([TaskStatus.PENDING, TaskStatus.REVIEW])("puts %s in attention with an explicit action", (status) => { const p=props(status); render(<VibeDashboardView {...p} />); fireEvent.click(within(screen.getByTestId("attention-task-card")).getByRole("button")); expect(p.onSelectTask).toHaveBeenCalledWith("t1"); });
  it("shows failed launch without changing the task status", () => { render(<VibeDashboardView {...props()} runtimes={[{ taskId:"t1", tabId:null, provider:"claude",state:"failed",errorCode:"missing-cli",updatedAt:"now" }]} />); expect(screen.getByTestId("attention-task-card").textContent).toContain("launchErrors.missing-cli"); });
});
