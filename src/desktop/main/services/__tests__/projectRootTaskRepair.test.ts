/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExistsSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mockExistsSync,
    },
    existsSync: mockExistsSync,
  };
});

const mockListWorktrees = vi.fn();
vi.mock("@/lib/gitOperations", () => ({
  listWorktrees: (...args: unknown[]) => mockListWorktrees(...args),
  validateGitRepo: vi.fn(),
  getDefaultBranch: vi.fn(),
  listBranches: vi.fn(),
  scanGitRepos: vi.fn(),
  execGit: vi.fn(),
}));

const mockFindOneBy = vi.fn();
const mockSave = vi.fn();
vi.mock("@/lib/database", () => ({
  getTaskRepository: async () => ({
    findOneBy: mockFindOneBy,
    save: mockSave,
  }),
  getProjectRepository: async () => ({
    findOneBy: vi.fn(),
  }),
}));

vi.mock("@/desktop/main/services/kanvibeTaskStateService", () => ({
  readPersistedTaskSyncStateAtPath: vi.fn(async () => ({
    status: null,
    description: null,
    projectPriority: undefined,
  })),
  persistTaskStateAtPath: vi.fn(async () => {}),
  readPersistedTaskStatusAtPath: vi.fn(async () => null),
}));

vi.mock("@/lib/claudeHooksSetup", () => ({
  getClaudeHooksStatus: vi.fn(async () => ({ installed: true })),
}));
vi.mock("@/lib/antigravityHooksSetup", () => ({
  getAntigravityHooksStatus: vi.fn(async () => ({ installed: true })),
}));
vi.mock("@/lib/codexHooksSetup", () => ({
  getCodexHooksStatus: vi.fn(async () => ({ installed: true })),
}));
vi.mock("@/lib/openCodeHooksSetup", () => ({
  getOpenCodeHooksStatus: vi.fn(async () => ({ installed: true })),
}));
vi.mock("@/lib/kanvibeHooksInstaller", () => ({
  installKanvibeHooks: vi.fn(),
  installKanvibeHookProvider: vi.fn(),
  scheduleKanvibeHooksInstall: vi.fn(),
}));
vi.mock("@/lib/nativeAgentRuntime", () => ({
  readNativeAgentMonitor: vi.fn(async () => ({ panes: [], runtimes: [], readAt: "2026-10-13T00:00:00Z" })),
}));

import type { Project } from "@/entities/Project";
import { persistTaskStateAtPath } from "@/desktop/main/services/kanvibeTaskStateService";

describe("ensureProjectRootTask worktreePath preservation", () => {
  const project = {
    id: "proj-1",
    name: "my-project",
    repoPath: "/workspace/my-project",
    defaultBranch: "main",
    sshHost: null,
  } as unknown as Project;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("does not reset worktreePath to null when default branch has no worktree entry but task already has a valid worktreePath", async () => {
    const existingTask = {
      id: "task-root",
      projectId: "proj-1",
      branchName: "main",
      baseBranch: "main",
      worktreePath: "/workspace/my-project",
      sshHost: null,
      status: "todo",
      priority: "medium",
    };
    mockFindOneBy.mockResolvedValue(existingTask);
    // listWorktrees returns empty or no worktree checkout for main
    mockListWorktrees.mockResolvedValue([]);
    // /workspace/my-project exists on disk
    mockExistsSync.mockImplementation((p) => p === "/workspace/my-project");
    mockSave.mockImplementation(async (t) => t);

    const { ensureProjectRootTask } = await import("@/desktop/main/services/projectService");
    const { task, repaired } = await ensureProjectRootTask(project, { repairHooks: false });

    expect(task?.worktreePath).toBe("/workspace/my-project");
    // Since task is already matching baseBranch and worktreePath is preserved and valid, no save was needed
    expect(mockSave).not.toHaveBeenCalled();
    expect(repaired).toBe(false);
  });

  it("repairs worktreePath to project.repoPath if task.worktreePath was pointing to a deleted directory", async () => {
    const existingTask = {
      id: "task-root",
      projectId: "proj-1",
      branchName: "main",
      baseBranch: "main",
      worktreePath: "/workspace/my-project__worktrees/deleted",
      sshHost: null,
      status: "todo",
      priority: "medium",
    };
    mockFindOneBy.mockResolvedValue(existingTask);
    mockListWorktrees.mockResolvedValue([]);
    // only repoPath exists, worktree does not exist
    mockExistsSync.mockImplementation((p) => p === "/workspace/my-project");
    mockSave.mockImplementation(async (t) => t);

    const { ensureProjectRootTask } = await import("@/desktop/main/services/projectService");
    const { task, repaired } = await ensureProjectRootTask(project, { repairHooks: false });

    expect(task?.worktreePath).toBe("/workspace/my-project");
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
      worktreePath: "/workspace/my-project",
    }));
    expect(repaired).toBe(true);
    // 사라진 경로에 .kanvibe 디렉터리를 다시 만들면 다음 repair가 그 경로를 살아 있다고 오판한다
    expect(persistTaskStateAtPath).toHaveBeenCalledWith("/workspace/my-project", expect.anything(), null);
    expect(persistTaskStateAtPath).not.toHaveBeenCalledWith("/workspace/my-project__worktrees/deleted", expect.anything(), expect.anything());
  });

  it("updates task.worktreePath to expected worktree path when listWorktrees returns an active worktree for default branch", async () => {
    const existingTask = {
      id: "task-root",
      projectId: "proj-1",
      branchName: "main",
      baseBranch: "main",
      worktreePath: "/workspace/my-project",
      sshHost: null,
      status: "todo",
      priority: "medium",
    };
    mockFindOneBy.mockResolvedValue(existingTask);
    mockListWorktrees.mockResolvedValue([
      { path: "/workspace/my-project__worktrees/main", branch: "main", isBare: false },
    ]);
    mockExistsSync.mockReturnValue(true);
    mockSave.mockImplementation(async (t) => t);

    const { ensureProjectRootTask } = await import("@/desktop/main/services/projectService");
    const { task, repaired } = await ensureProjectRootTask(project, { repairHooks: false });

    expect(task?.worktreePath).toBe("/workspace/my-project__worktrees/main");
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
      worktreePath: "/workspace/my-project__worktrees/main",
    }));
    expect(repaired).toBe(true);
  });
});
