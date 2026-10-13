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

const mockFindOne = vi.fn();
const mockFindOneBy = vi.fn();
const mockProjectFindOneBy = vi.fn();
vi.mock("@/lib/database", () => ({
  getTaskRepository: async () => ({
    findOne: mockFindOne,
    findOneBy: mockFindOneBy,
  }),
  getProjectRepository: async () => ({
    findOneBy: mockProjectFindOneBy,
  }),
}));

const mockParseSSHConfig = vi.fn();
vi.mock("@/lib/sshConfig", () => ({
  parseSSHConfig: (...args: unknown[]) => mockParseSSHConfig(...args),
}));

const mockDecodeDataUrlToBuffer = vi.fn();
const mockTransferImageToRemoteHost = vi.fn();
vi.mock("@/lib/remoteImagePaste", () => ({
  decodeDataUrlToBuffer: (...args: unknown[]) => mockDecodeDataUrlToBuffer(...args),
  transferImageToRemoteHost: (...args: unknown[]) => mockTransferImageToRemoteHost(...args),
}));

const mockAttachLocalSession = vi.fn();
const mockAttachRemoteSession = vi.fn();
vi.mock("@/lib/terminal", () => ({
  attachLocalSession: (...args: unknown[]) => mockAttachLocalSession(...args),
  attachRemoteSession: (...args: unknown[]) => mockAttachRemoteSession(...args),
  focusSession: vi.fn(),
}));

vi.mock("@/lib/remoteSessionDependency", () => ({
  ensureRemoteSessionDependency: vi.fn(),
}));

vi.mock("@/desktop/main/services/paneLayoutService", () => ({
  getEffectivePaneLayout: vi.fn(),
}));

const SSH_CONFIG = {
  host: "app-prod",
  hostname: "example.com",
  port: 2202,
  username: "tester",
  privateKeyPath: "/tmp/test-key",
};

async function importBridge() {
  return import("@/desktop/main/terminalBridge");
}

function createMockWebContents(id = 1) {
  return {
    id,
    isDestroyed: () => false,
    send: vi.fn(),
  };
}

describe("terminalBridge.pasteImageToRemoteTerminal", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an error without attempting a transfer when the task has no sshHost (local session)", async () => {
    mockFindOneBy.mockResolvedValue({ id: "task-1", sshHost: null });
    const { pasteImageToRemoteTerminal } = await importBridge();

    const result = await pasteImageToRemoteTerminal("task-1", "data:image/png;base64,aGVsbG8=");

    expect(result).toEqual({ ok: false, error: "원격 세션이 아닙니다." });
    expect(mockTransferImageToRemoteHost).not.toHaveBeenCalled();
  });

  it("returns an error when the task's sshHost has no matching parsed SSH config", async () => {
    mockFindOneBy.mockResolvedValue({ id: "task-1", sshHost: "unknown-host" });
    mockParseSSHConfig.mockResolvedValue([]);
    const { pasteImageToRemoteTerminal } = await importBridge();

    const result = await pasteImageToRemoteTerminal("task-1", "data:image/png;base64,aGVsbG8=");

    expect(result).toEqual({ ok: false, error: "SSH 호스트를 찾을 수 없습니다: unknown-host" });
  });

  it("transfers the decoded image and resolves with the remote path for a remote session", async () => {
    mockFindOneBy.mockResolvedValue({ id: "task-1", sshHost: "app-prod" });
    mockParseSSHConfig.mockResolvedValue([SSH_CONFIG]);
    const decodedBuffer = Buffer.from("hello");
    mockDecodeDataUrlToBuffer.mockReturnValue(decodedBuffer);
    mockTransferImageToRemoteHost.mockResolvedValue("/tmp/kanvibe-paste-fixed-uuid.png");
    const { pasteImageToRemoteTerminal } = await importBridge();

    const result = await pasteImageToRemoteTerminal("task-1", "data:image/png;base64,aGVsbG8=");

    expect(result).toEqual({ ok: true, remotePath: "/tmp/kanvibe-paste-fixed-uuid.png" });
    expect(mockTransferImageToRemoteHost).toHaveBeenCalledWith(SSH_CONFIG, decodedBuffer);
  });

  it("returns the failure message when the scp transfer rejects", async () => {
    mockFindOneBy.mockResolvedValue({ id: "task-1", sshHost: "app-prod" });
    mockParseSSHConfig.mockResolvedValue([SSH_CONFIG]);
    mockDecodeDataUrlToBuffer.mockReturnValue(Buffer.from("hello"));
    mockTransferImageToRemoteHost.mockRejectedValue(new Error("scp 전송 실패 (exit 1): Permission denied"));
    const { pasteImageToRemoteTerminal } = await importBridge();

    const result = await pasteImageToRemoteTerminal("task-1", "data:image/png;base64,aGVsbG8=");

    expect(result).toEqual({ ok: false, error: "scp 전송 실패 (exit 1): Permission denied" });
  });
});

describe("terminalBridge.openTerminal working directory resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses project.repoPath when task.worktreePath is null for local session", async () => {
    const task = {
      id: "task-root",
      sessionType: "terminal",
      sessionName: "s-root",
      sshHost: null,
      worktreePath: null,
      project: { repoPath: "/workspace/my-repo" },
    };
    mockFindOne.mockResolvedValue(task);
    mockExistsSync.mockImplementation((p) => p === "/workspace/my-repo");

    const { openTerminal } = await importBridge();
    const result = await openTerminal(createMockWebContents(1) as never, "task-root", null, 80, 24);

    expect(result).toEqual({ ok: true });
    expect(mockAttachLocalSession).toHaveBeenCalledTimes(1);
    const passedCwd = mockAttachLocalSession.mock.calls[0][5];
    expect(passedCwd).toBe("/workspace/my-repo");
  });

  it("falls back to project.repoPath when task.worktreePath does not exist on disk", async () => {
    const task = {
      id: "task-deleted-wt",
      sessionType: "terminal",
      sessionName: "s-deleted",
      sshHost: null,
      worktreePath: "/workspace/my-repo__worktrees/deleted",
      project: { repoPath: "/workspace/my-repo" },
    };
    mockFindOne.mockResolvedValue(task);
    mockExistsSync.mockImplementation((p) => p === "/workspace/my-repo");

    const { openTerminal } = await importBridge();
    const result = await openTerminal(createMockWebContents(2) as never, "task-deleted-wt", null, 80, 24);

    expect(result).toEqual({ ok: true });
    expect(mockAttachLocalSession).toHaveBeenCalledTimes(1);
    const passedCwd = mockAttachLocalSession.mock.calls[0][5];
    expect(passedCwd).toBe("/workspace/my-repo");
  });

  it("returns an error instead of opening at home when neither worktreePath nor repoPath exists on disk", async () => {
    const task = {
      id: "task-missing-all",
      sessionType: "terminal",
      sessionName: "s-missing",
      sshHost: null,
      worktreePath: "/workspace/missing-wt",
      project: { repoPath: "/workspace/missing-repo" },
    };
    mockFindOne.mockResolvedValue(task);
    mockExistsSync.mockReturnValue(false);

    const { openTerminal } = await importBridge();
    const result = await openTerminal(createMockWebContents(3) as never, "task-missing-all", null, 80, 24);

    expect(result).toEqual({
      ok: false,
      error: "작업 디렉토리가 존재하지 않습니다: /workspace/missing-wt",
    });
    expect(mockAttachLocalSession).not.toHaveBeenCalled();
  });

  it("uses project.repoPath for remote session when task.worktreePath is null", async () => {
    const task = {
      id: "task-remote-root",
      sessionType: "terminal",
      sessionName: "s-remote-root",
      sshHost: "app-prod",
      worktreePath: null,
      project: { repoPath: "/remote/repo" },
    };
    mockFindOne.mockResolvedValue(task);
    mockFindOneBy.mockResolvedValue(task);
    mockParseSSHConfig.mockResolvedValue([SSH_CONFIG]);

    const { openTerminal } = await importBridge();
    const result = await openTerminal(createMockWebContents(4) as never, "task-remote-root", null, 80, 24);

    expect(result).toEqual({ ok: true });
    expect(mockAttachRemoteSession).toHaveBeenCalledTimes(1);
    const passedCwd = mockAttachRemoteSession.mock.calls[0][9];
    expect(passedCwd).toBe("/remote/repo");
  });
});
