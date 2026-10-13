import { existsSync } from "fs";

export interface TaskWorkingDirectoryContext {
  worktreePath?: string | null;
  project?: { repoPath: string } | null;
}

/**
 * Resolves the candidate working directory for a task.
 * Returns task.worktreePath || task.project?.repoPath || null.
 */
export function resolveTaskWorkingDirectory(
  task: TaskWorkingDirectoryContext | null | undefined,
): string | null {
  if (!task) return null;
  const worktreePath = task.worktreePath?.trim() || null;
  const repoPath = task.project?.repoPath?.trim() || null;
  return worktreePath || repoPath || null;
}

export type ValidLocalWorkingDirectoryResult =
  | { ok: true; cwd: string }
  | { ok: false; error: string };

/**
 * For a local session, resolves and validates the working directory against the filesystem.
 * If task.worktreePath exists on disk, it is used.
 * If task.worktreePath does not exist, it falls back to task.project?.repoPath if that exists.
 * If neither exists on disk (or neither was provided), it returns an error result.
 */
export function resolveValidLocalWorkingDirectory(
  task: TaskWorkingDirectoryContext | null | undefined,
): ValidLocalWorkingDirectoryResult {
  if (!task) {
    return { ok: false, error: "태스크 정보가 없습니다." };
  }

  const worktreePath = task.worktreePath?.trim() || null;
  const repoPath = task.project?.repoPath?.trim() || null;

  if (worktreePath && existsSync(worktreePath)) {
    return { ok: true, cwd: worktreePath };
  }

  if (repoPath && existsSync(repoPath)) {
    return { ok: true, cwd: repoPath };
  }

  const candidate = worktreePath || repoPath;
  if (candidate) {
    return { ok: false, error: `작업 디렉토리가 존재하지 않습니다: ${candidate}` };
  }

  return { ok: false, error: "작업 디렉토리가 설정되지 않았습니다." };
}
