import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  taskRepo: { findOneBy: vi.fn() },
  projectRepo: { findOneBy: vi.fn() },
  execFile: vi.fn(),
  createLocalShellEnvironment: vi.fn(() => ({ PATH: "/usr/local/bin" })),
  existsSync: vi.fn(),
}));

vi.mock("child_process", () => ({
  execFile: mocks.execFile,
  default: { execFile: mocks.execFile },
}));

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
  default: { existsSync: mocks.existsSync },
}));

vi.mock("@/lib/database", () => ({
  getTaskRepository: vi.fn(async () => mocks.taskRepo),
  getProjectRepository: vi.fn(async () => mocks.projectRepo),
}));

vi.mock("@/lib/shellEnvironment", () => ({
  createLocalShellEnvironment: mocks.createLocalShellEnvironment,
}));

function resolveExecFileSuccessfully() {
  mocks.execFile.mockImplementation((_command, _args, _options, callback) => {
    callback(null, "", "");
    return {} as never;
  });
}

const originalPlatform = process.platform;
function stubPlatform(platform: string): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

describe("editorService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubPlatform("darwin");
    mocks.createLocalShellEnvironment.mockReturnValue({ PATH: "/usr/local/bin" });
    mocks.existsSync.mockReturnValue(false);
    resolveExecFileSuccessfully();
  });

  afterEach(() => {
    stubPlatform(originalPlatform);
  });

  describe("Unix (darwin / linux)", () => {
    it("로컬 작업은 worktree 경로만 넘겨 VS Code를 연다", async () => {
      mocks.taskRepo.findOneBy.mockResolvedValue({
        id: "task-1",
        projectId: "project-1",
        worktreePath: "/workspace/repo__worktrees/feature",
        sshHost: null,
      });
      mocks.projectRepo.findOneBy.mockResolvedValue({ id: "project-1", repoPath: "/workspace/repo", sshHost: null });

      const { openTaskInVsCode } = await import("@/desktop/main/services/editorService");

      await expect(openTaskInVsCode("task-1")).resolves.toEqual({ ok: true });
      expect(mocks.execFile).toHaveBeenCalledWith(
        "code",
        ["/workspace/repo__worktrees/feature"],
        expect.objectContaining({ env: { PATH: "/usr/local/bin" } }),
        expect.any(Function),
      );
    });

    it("원격 작업은 로컬 VS Code를 Remote-SSH로 붙여서 연다", async () => {
      mocks.taskRepo.findOneBy.mockResolvedValue({
        id: "task-2",
        projectId: "project-remote",
        worktreePath: "/remote/repo__worktrees/feature",
        sshHost: null,
      });
      mocks.projectRepo.findOneBy.mockResolvedValue({
        id: "project-remote",
        repoPath: "/remote/repo",
        sshHost: "build-box",
      });

      const { openTaskInVsCode } = await import("@/desktop/main/services/editorService");

      await expect(openTaskInVsCode("task-2")).resolves.toEqual({ ok: true });
      expect(mocks.execFile).toHaveBeenCalledWith(
        "code",
        ["--remote", "ssh-remote+build-box", "/remote/repo__worktrees/feature"],
        expect.anything(),
        expect.any(Function),
      );
    });

    it("worktree가 없으면 프로젝트 저장소 경로를 연다", async () => {
      mocks.taskRepo.findOneBy.mockResolvedValue({
        id: "task-3",
        projectId: "project-1",
        worktreePath: null,
        sshHost: null,
      });
      mocks.projectRepo.findOneBy.mockResolvedValue({ id: "project-1", repoPath: "/workspace/repo", sshHost: null });

      const { openTaskInVsCode } = await import("@/desktop/main/services/editorService");

      await openTaskInVsCode("task-3");

      expect(mocks.execFile).toHaveBeenCalledWith("code", ["/workspace/repo"], expect.anything(), expect.any(Function));
    });

    it("열 경로를 찾지 못하면 VS Code를 실행하지 않는다", async () => {
      mocks.taskRepo.findOneBy.mockResolvedValue({
        id: "task-4",
        projectId: null,
        worktreePath: null,
        sshHost: null,
      });

      const { openTaskInVsCode } = await import("@/desktop/main/services/editorService");

      await expect(openTaskInVsCode("task-4")).resolves.toEqual({ ok: false, error: "no-target-path" });
      expect(mocks.execFile).not.toHaveBeenCalled();
    });

    it("code 명령을 찾지 못하면 실패 사유를 돌려준다", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.taskRepo.findOneBy.mockResolvedValue({
        id: "task-5",
        projectId: null,
        worktreePath: "/workspace/repo__worktrees/feature",
        sshHost: null,
      });
      mocks.execFile.mockImplementation((_command, _args, _options, callback) => {
        callback(Object.assign(new Error("spawn code ENOENT"), { code: "ENOENT" }), "", "");
        return {} as never;
      });

      const { openTaskInVsCode } = await import("@/desktop/main/services/editorService");

      await expect(openTaskInVsCode("task-5")).resolves.toEqual({ ok: false, error: "spawn code ENOENT" });
      consoleErrorSpy.mockRestore();
    });
  });

  describe("escapeCmdArg", () => {
    it("빈 문자열을 큰따옴표 쌍으로 반환한다", async () => {
      const { escapeCmdArg } = await import("@/desktop/main/services/editorService");
      expect(escapeCmdArg("")).toBe('""');
    });

    it("공백이나 메타문자가 없는 일반 인자는 그대로 반환한다", async () => {
      const { escapeCmdArg } = await import("@/desktop/main/services/editorService");
      expect(escapeCmdArg("normal_arg")).toBe("normal_arg");
      expect(escapeCmdArg("--remote")).toBe("--remote");
      expect(escapeCmdArg("C:\\repo\\project")).toBe("C:\\repo\\project");
    });

    it("공백이나 cmd 메타문자가 포함된 인자는 큰따옴표로 감싸고 내부 따옴표를 이스케이프한다", async () => {
      const { escapeCmdArg } = await import("@/desktop/main/services/editorService");
      expect(escapeCmdArg("C:\\My Projects\\repo")).toBe('"C:\\My Projects\\repo"');
      expect(escapeCmdArg('say "hello"')).toBe('"say ""hello"""');
      expect(escapeCmdArg("feat&fix")).toBe('"feat&fix"');
      expect(escapeCmdArg("100%")).toBe('"100%"');
    });
  });

  describe("findWindowsVsCodeCommand", () => {
    it("LOCALAPPDATA 경로에 설치된 code.cmd를 우선 감지한다", async () => {
      const { findWindowsVsCodeCommand } = await import("@/desktop/main/services/editorService");
      const userCodeCmd = "C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd";
      mocks.existsSync.mockImplementation((p: string) => p === userCodeCmd);

      const found = findWindowsVsCodeCommand({
        LOCALAPPDATA: "C:\\Users\\User\\AppData\\Local",
      });

      expect(found).toBe(userCodeCmd);
    });

    it("기본 설치 경로에 없으면 PATH를 탐색하여 code.cmd를 찾는다", async () => {
      const { findWindowsVsCodeCommand } = await import("@/desktop/main/services/editorService");
      const customPathCode = "D:\\CustomTools\\bin\\code.cmd";
      mocks.existsSync.mockImplementation((p: string) => p === customPathCode);

      const found = findWindowsVsCodeCommand({
        PATH: "C:\\Windows\\System32;D:\\CustomTools\\bin",
      });

      expect(found).toBe(customPathCode);
    });

    it("어디에도 존재하지 않으면 null을 반환한다", async () => {
      const { findWindowsVsCodeCommand } = await import("@/desktop/main/services/editorService");
      mocks.existsSync.mockReturnValue(false);

      const found = findWindowsVsCodeCommand({
        LOCALAPPDATA: "C:\\User\\AppData\\Local",
        PATH: "C:\\Windows",
      });

      expect(found).toBeNull();
    });
  });

  describe("buildVsCodeExecution", () => {
    it("Unix 플랫폼에서는 code 명령과 원래 인자를 그대로 반환한다", async () => {
      const { buildVsCodeExecution } = await import("@/desktop/main/services/editorService");
      const plan = buildVsCodeExecution(["/path/to/project"], "darwin");
      expect(plan).toEqual({
        file: "code",
        args: ["/path/to/project"],
      });
    });

    it("Windows 플랫폼에서는 cmd.exe 래퍼와 verbatimArguments 옵션을 구성한다", async () => {
      const { buildVsCodeExecution } = await import("@/desktop/main/services/editorService");
      const userCodeCmd = "C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd";
      mocks.existsSync.mockImplementation((p: string) => p === userCodeCmd);

      const plan = buildVsCodeExecution(
        ["C:\\My Workspaces\\project with spaces"],
        "win32",
        {
          ComSpec: "C:\\Windows\\System32\\cmd.exe",
          LOCALAPPDATA: "C:\\Users\\User\\AppData\\Local",
        },
      );

      expect(plan.file).toBe("C:\\Windows\\System32\\cmd.exe");
      expect(plan.options).toEqual({ windowsVerbatimArguments: true });
      expect(plan.args[0]).toBe("/d");
      expect(plan.args[1]).toBe("/s");
      expect(plan.args[2]).toBe("/c");
      expect(plan.args[3]).toContain(`"${userCodeCmd}" "C:\\My Workspaces\\project with spaces"`);
    });
  });

  describe("Windows (win32) openTaskInVsCode", () => {
    it("Windows에서 공백이 포함된 worktree 경로를 cmd.exe를 통해 안전하게 연다", async () => {
      stubPlatform("win32");
      const userCodeCmd = "C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd";
      mocks.existsSync.mockImplementation((p: string) => p === userCodeCmd);

      mocks.taskRepo.findOneBy.mockResolvedValue({
        id: "task-win-1",
        projectId: "project-win-1",
        worktreePath: "C:\\Users\\User\\My Worktree\\feat space",
        sshHost: null,
      });
      mocks.projectRepo.findOneBy.mockResolvedValue({
        id: "project-win-1",
        repoPath: "C:\\Users\\User\\My Worktree\\main",
        sshHost: null,
      });

      const { openTaskInVsCode } = await import("@/desktop/main/services/editorService");

      await expect(openTaskInVsCode("task-win-1")).resolves.toEqual({ ok: true });
      expect(mocks.execFile).toHaveBeenCalledWith(
        expect.stringMatching(/cmd\.exe$/i),
        expect.arrayContaining(["/d", "/s", "/c"]),
        expect.objectContaining({
          windowsVerbatimArguments: true,
        }),
        expect.any(Function),
      );
    });

    it("Windows에서 원격 SSH 작업도 --remote 인자와 함께 cmd.exe로 전달한다", async () => {
      stubPlatform("win32");
      mocks.taskRepo.findOneBy.mockResolvedValue({
        id: "task-win-remote",
        projectId: "proj-remote",
        worktreePath: "/home/ubuntu/remote-worktree",
        sshHost: null,
      });
      mocks.projectRepo.findOneBy.mockResolvedValue({
        id: "proj-remote",
        repoPath: "/home/ubuntu/repo",
        sshHost: "aws-ec2",
      });

      const { openTaskInVsCode } = await import("@/desktop/main/services/editorService");

      await expect(openTaskInVsCode("task-win-remote")).resolves.toEqual({ ok: true });
      expect(mocks.execFile).toHaveBeenCalledWith(
        expect.stringMatching(/cmd\.exe$/i),
        expect.arrayContaining([
          expect.stringContaining("--remote ssh-remote+aws-ec2 /home/ubuntu/remote-worktree"),
        ]),
        expect.objectContaining({
          windowsVerbatimArguments: true,
        }),
        expect.any(Function),
      );
    });
  });
});

