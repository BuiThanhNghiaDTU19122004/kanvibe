import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateTaskModal, { slugifyToBranchName } from "../CreateTaskModal";
import type { Project } from "@/entities/Project";
const mocks = vi.hoisted(() => ({ create: vi.fn(), branches: vi.fn(), push: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/desktop/renderer/navigation", () => ({ localizeHref: (href: string) => `/en${href}`, redirect: mocks.push, usePathname: () => "/en", useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/desktop/renderer/actions/kanban", () => ({ createTask: mocks.create }));
vi.mock("@/desktop/renderer/actions/project", () => ({ getProjectBranches: mocks.branches }));
vi.mock("../ProjectSelector", () => ({ default: () => null }));
vi.mock("../PrioritySelector", () => ({ default: () => null }));
vi.mock("../BranchSearchInput", () => ({ default: () => null }));
const project = { id: "p1", repoPath: "D:/project", defaultBranch: "main", sshHost: null, isWorktree: false } as Project;
function open() { render(<CreateTaskModal isOpen onClose={vi.fn()} sshHosts={[]} projects={[project]} defaultSessionType="terminal" />); }
function prompt(text = "Sửa lỗi đăng nhập") { fireEvent.change(screen.getByLabelText("promptLabel"), { target: { value: text } }); }
describe("beginner task creation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.branches.mockResolvedValue(["main"]); mocks.create.mockResolvedValue({ id: "t1" }); delete window.kanvibeDesktop; });
  it("creates a Vietnamese title and branch with Claude and native terminal", async () => {
    open(); prompt(); fireEvent.click(screen.getByRole("button", { name: "startTask" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ title: "Sửa lỗi đăng nhập", description: "Sửa lỗi đăng nhập", branchName: "feat/sua-loi-dang-nhap", agentType: "claude", projectId: "p1", baseBranch: "main", sessionType: "terminal" })));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/en/task/t1?autostart=1"));
  });
  it("keeps Enter as a newline in the request", async () => {
    open(); await userEvent.type(screen.getByLabelText("promptLabel"), "First line{enter}Second line");
    expect((screen.getByLabelText("promptLabel") as HTMLTextAreaElement).value).toBe("First line\nSecond line"); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("honors turning auto-start off", async () => {
    open(); prompt(); fireEvent.click(screen.getByText("advancedOptions")); fireEvent.click(screen.getByRole("checkbox", { name: "agentAutoStart" }));
    fireEvent.click(screen.getByRole("button", { name: "create" })); await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/en/task/t1"));
  });
  it("supports manually creating without an agent", async () => {
    open(); prompt(); fireEvent.click(screen.getByRole("radio", { name: "agentNone" })); fireEvent.click(screen.getByRole("button", { name: "create" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/en/task/t1")); expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("agentType");
  });
  it("preserves customized title and branch when the request changes", () => {
    open(); prompt(); fireEvent.change(screen.getByLabelText("taskTitle"), { target: { value: "My title" } }); fireEvent.click(screen.getByText("advancedOptions"));
    fireEvent.change(screen.getByLabelText(/branchName/), { target: { value: "fix/custom" } }); prompt("Different request");
    expect((screen.getByLabelText("taskTitle") as HTMLInputElement).value).toBe("My title"); expect((screen.getByLabelText(/branchName/) as HTMLInputElement).value).toBe("fix/custom");
  });
  it("retains request and reports creation failure", async () => {
    mocks.create.mockRejectedValue(new Error("Worktree creation failed")); open(); prompt(); fireEvent.click(screen.getByRole("button", { name: "startTask" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Worktree creation failed"); expect((screen.getByLabelText("promptLabel") as HTMLTextAreaElement).value).toBe("Sửa lỗi đăng nhập"); expect(mocks.push).not.toHaveBeenCalled();
  });
  it("provides a valid fallback branch for a non-Latin title", async () => {
    open(); prompt("修复问题"); fireEvent.click(screen.getByRole("button", { name: "startTask" })); await waitFor(() => expect(mocks.create).toHaveBeenCalled()); expect(mocks.create.mock.calls[0][0].branchName).toMatch(/^feat\/task-[a-f0-9]{8}$/);
  });
  it("normalizes Vietnamese branch names", () => { expect(slugifyToBranchName("Đổi mật khẩu")).toBe("feat/doi-mat-khau"); expect(slugifyToBranchName(" Hello__World! ")).toBe("feat/hello-world"); });
});
