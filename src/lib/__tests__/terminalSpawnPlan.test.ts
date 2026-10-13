import { describe, expect, it } from "vitest";
import { SessionType } from "@/entities/KanbanTask";
import { buildLocalPtySpawnPlan } from "@/lib/terminal";
import { homedir } from "os";

describe("buildLocalPtySpawnPlan working directory handling", () => {
  const homeDir = process.env.HOME || homedir();

  it("uses provided cwd for SessionType.TERMINAL without falling back to home", () => {
    const plan = buildLocalPtySpawnPlan(SessionType.TERMINAL, "session-1", "/my/repo/path", false);
    expect(plan.cwd).toBe("/my/repo/path");
  });

  it("falls back to home directory for SessionType.TERMINAL when cwd is null or undefined", () => {
    const planNull = buildLocalPtySpawnPlan(SessionType.TERMINAL, "session-1", null, false);
    expect(planNull.cwd).toBe(homeDir);

    const planUndefined = buildLocalPtySpawnPlan(SessionType.TERMINAL, "session-1", undefined, false);
    expect(planUndefined.cwd).toBe(homeDir);
  });

  it("uses provided cwd for SessionType.TMUX attach without falling back to home", () => {
    const plan = buildLocalPtySpawnPlan(SessionType.TMUX, "session-tmux", "/my/repo/path", false);
    expect(plan.cwd).toBe("/my/repo/path");
    expect(plan.args).toEqual(["attach-session", "-t", "session-tmux"]);
  });

  it("falls back to home directory for SessionType.TMUX when cwd is null", () => {
    const plan = buildLocalPtySpawnPlan(SessionType.TMUX, "session-tmux", null, false);
    expect(plan.cwd).toBe(homeDir);
  });

  it("uses provided cwd for SessionType.ZELLIJ attach without falling back to home", () => {
    const plan = buildLocalPtySpawnPlan(SessionType.ZELLIJ, "session-zellij", "/my/repo/path", false);
    expect(plan.cwd).toBe("/my/repo/path");
    expect(plan.args).toEqual(["attach", "session-zellij"]);
  });

  it("uses provided cwd for SessionType.ZELLIJ creation", () => {
    const plan = buildLocalPtySpawnPlan(SessionType.ZELLIJ, "session-zellij", "/my/repo/path", true);
    expect(plan.cwd).toBe("/my/repo/path");
    expect(plan.args).toContain("session-zellij");
  });
});
