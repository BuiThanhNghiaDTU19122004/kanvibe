// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { listLocalDirectories, scanLocalGitRepos } from "../localDirectories";

describe("native directory scanning", () => {
  it("finds repositories and worktrees with spaces, skips dependencies and respects scan depth", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kanvibe-scan-"));
    try {
      await mkdir(path.join(root, "project space", ".git"), { recursive: true });
      await mkdir(path.join(root, "linked tree"));
      await writeFile(path.join(root, "linked tree", ".git"), "gitdir: elsewhere");
      await mkdir(path.join(root, "node_modules", "hidden", ".git"), { recursive: true });
      await mkdir(path.join(root, "a", "b", "c", "d", ".git"), { recursive: true });
      expect(await scanLocalGitRepos(root)).toEqual([path.join(root, "linked tree"), path.join(root, "project space")]);
      expect(await listLocalDirectories(root)).toContain("project space");
      await expect(scanLocalGitRepos(path.join(root, "missing"))).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
