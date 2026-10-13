import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTaskWorkingDirectory, resolveValidLocalWorkingDirectory } from "@/lib/taskWorkingDirectory";

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

describe("resolveTaskWorkingDirectory", () => {
  beforeEach(() => {
    mockExistsSync.mockImplementation((p: unknown) => {
      return p === "/existing/worktree" || p === "/existing/repo";
    });
  });
  it("returns null if task is null or undefined", () => {
    expect(resolveTaskWorkingDirectory(null)).toBeNull();
    expect(resolveTaskWorkingDirectory(undefined)).toBeNull();
  });

  it("prioritizes worktreePath when available", () => {
    const result = resolveTaskWorkingDirectory({
      worktreePath: "/my/worktree",
      project: { repoPath: "/my/repo" },
    });
    expect(result).toBe("/my/worktree");
  });

  it("falls back to project.repoPath when worktreePath is null or empty", () => {
    const result = resolveTaskWorkingDirectory({
      worktreePath: null,
      project: { repoPath: "/my/repo" },
    });
    expect(result).toBe("/my/repo");

    const result2 = resolveTaskWorkingDirectory({
      worktreePath: "   ",
      project: { repoPath: "/my/repo" },
    });
    expect(result2).toBe("/my/repo");
  });

  it("returns null when neither worktreePath nor project repoPath exists", () => {
    const result = resolveTaskWorkingDirectory({
      worktreePath: null,
      project: null,
    });
    expect(result).toBeNull();
  });
});

describe("resolveValidLocalWorkingDirectory", () => {
  it("returns error if task is missing", () => {
    expect(resolveValidLocalWorkingDirectory(null)).toEqual({
      ok: false,
      error: "태스크 정보가 없습니다.",
    });
  });

  it("uses worktreePath if it exists on disk", () => {
    const result = resolveValidLocalWorkingDirectory({
      worktreePath: "/existing/worktree",
      project: { repoPath: "/existing/repo" },
    });
    expect(result).toEqual({
      ok: true,
      cwd: "/existing/worktree",
    });
  });

  it("falls back to project repoPath if worktreePath does not exist on disk", () => {
    const result = resolveValidLocalWorkingDirectory({
      worktreePath: "/missing/worktree",
      project: { repoPath: "/existing/repo" },
    });
    expect(result).toEqual({
      ok: true,
      cwd: "/existing/repo",
    });
  });

  it("returns error if neither worktreePath nor repoPath exists on disk", () => {
    const result = resolveValidLocalWorkingDirectory({
      worktreePath: "/missing/worktree",
      project: { repoPath: "/missing/repo" },
    });
    expect(result).toEqual({
      ok: false,
      error: "작업 디렉토리가 존재하지 않습니다: /missing/worktree",
    });
  });

  it("returns error if no candidate paths are provided", () => {
    const result = resolveValidLocalWorkingDirectory({
      worktreePath: null,
      project: null,
    });
    expect(result).toEqual({
      ok: false,
      error: "작업 디렉토리가 설정되지 않았습니다.",
    });
  });
});
