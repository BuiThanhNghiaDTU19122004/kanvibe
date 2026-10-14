import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ControlPanelDialog, { CONTROL_PANEL_OPEN_EVENT } from "@/desktop/renderer/components/ControlPanelDialog";
import { loadShortcutBindings } from "@/desktop/renderer/utils/shortcutBindings";
import { DEFAULT_SHORTCUT_BINDINGS } from "@/desktop/shared/shortcutBindings";

const mocks = vi.hoisted(() => ({
  getSearchableTasks: vi.fn(),
  push: vi.fn(),
  focusExistingInternalRoute: vi.fn(),
  getShortcutBindings: vi.fn(),
  hasShortcutBlocker: false,
  agentMonitor: {
    value: {
      panes: [] as unknown[],
      runtimes: [] as Array<{
        taskId: string;
        tabId: string | null;
        provider: string;
        state: string;
        errorCode: string | null;
        updatedAt: string;
      }>,
      readAt: "",
    },
    error: false,
    updatedAt: null as string | null,
    retry: vi.fn(),
  },
  scrollIntoView: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("@/desktop/renderer/actions/kanban", () => ({
  getSearchableTasks: (...args: unknown[]) => mocks.getSearchableTasks(...args),
}));

vi.mock("@/desktop/renderer/actions/appSettings", () => ({
  getShortcutBindings: (...args: unknown[]) => mocks.getShortcutBindings(...args),
  setShortcutBindings: vi.fn(),
}));

vi.mock("@/desktop/renderer/navigation", () => ({
  localizeHref: (href: string, currentLocale = "ko") => (
    href.startsWith("/") ? `/${currentLocale}${href}` : href
  ),
  redirect: (...args: unknown[]) => mocks.push(...args),
  usePathname: () => "/en",
  useRouter: () => ({
    push: (...args: unknown[]) => mocks.push(...args),
  }),
}));

vi.mock("@/desktop/renderer/components/BoardCommandProvider", () => ({
  useHasBoardShortcutBlocker: () => mocks.hasShortcutBlocker,
}));

vi.mock("@/desktop/renderer/hooks/useLiveAiSessions", () => ({
  useAgentMonitor: () => mocks.agentMonitor,
}));

const SEARCHABLE_TASKS = [
  {
    id: "task-beta",
    title: "Older Beta",
    branchName: "feat/beta",
    projectId: "project-kanvibe",
    projectName: "kanvibe",
    sshHost: null,
    status: "todo",
    hasTerminal: false,
    updatedAt: "2026-04-30T00:00:00.000Z",
  },
  {
    id: "task-alpha",
    title: "Newer Alpha",
    branchName: "feat/alpha",
    projectId: "project-kanvibe",
    projectName: "kanvibe",
    sshHost: null,
    status: "progress",
    hasTerminal: true,
    updatedAt: "2026-04-30T02:00:00.000Z",
  },
  {
    id: "task-api",
    title: "API Task",
    branchName: "fix/api",
    projectId: "project-api",
    projectName: "api-server",
    sshHost: "devbox",
    status: "review",
    hasTerminal: true,
    updatedAt: "2026-04-29T00:00:00.000Z",
  },
  {
    id: "task-solo",
    title: "Solo Task",
    branchName: "chore/solo",
    projectId: null,
    projectName: null,
    sshHost: null,
    status: "done",
    hasTerminal: false,
    updatedAt: "2026-04-28T00:00:00.000Z",
  },
];

function openPanel() {
  fireEvent.keyDown(window, {
    key: "k",
    ctrlKey: true,
    shiftKey: true,
  });
}

function expectBefore(earlier: Element, later: Element) {
  expect(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe("ControlPanelDialog", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.hasShortcutBlocker = false;
    mocks.agentMonitor = {
      value: { panes: [], runtimes: [], readAt: "" },
      error: false,
      updatedAt: null,
      retry: vi.fn(),
    };
    mocks.getShortcutBindings.mockResolvedValue({ ...DEFAULT_SHORTCUT_BINDINGS });
    await loadShortcutBindings();
    window.history.replaceState({}, "", "/#/en");
    window.kanvibeDesktop = {
      isDesktop: true,
      focusExistingInternalRoute: mocks.focusExistingInternalRoute.mockResolvedValue(false),
    } as unknown as NonNullable<typeof window.kanvibeDesktop>;
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: mocks.scrollIntoView,
    });
    mocks.getSearchableTasks.mockResolvedValue(SEARCHABLE_TASKS);
  });

  it("단축키로 패널을 열고 프로젝트 이름순으로 묶어 보여 준다", async () => {
    render(<ControlPanelDialog />);

    openPanel();

    expect(await screen.findByRole("dialog")).toBeTruthy();
    await screen.findByText("Newer Alpha");

    const apiHeader = screen.getByText("api-server");
    const kanvibeHeader = screen.getByText("kanvibe");
    const noProjectHeader = screen.getByText("controlPanel.noProject");

    expectBefore(apiHeader, kanvibeHeader);
    expectBefore(kanvibeHeader, noProjectHeader);
  });

  it("그룹 안에서는 updatedAt 내림차순으로 정렬한다", async () => {
    render(<ControlPanelDialog />);

    openPanel();

    const newerRow = await screen.findByRole("button", { name: /Newer Alpha/ });
    const olderRow = screen.getByRole("button", { name: /Older Beta/ });

    expectBefore(newerRow, olderRow);
  });

  it("모니터가 실행 중인 런타임을 보고하면 그 태스크에 에이전트 실행 중 배지를 준다", async () => {
    mocks.agentMonitor = {
      value: {
        panes: [],
        runtimes: [{
          taskId: "task-alpha",
          tabId: null,
          provider: "claude",
          state: "running",
          errorCode: null,
          updatedAt: "2026-04-30T02:00:00.000Z",
        }],
        readAt: "2026-04-30T02:00:00.000Z",
      },
      error: false,
      updatedAt: null,
      retry: vi.fn(),
    };

    render(<ControlPanelDialog />);

    openPanel();

    const agentRow = await screen.findByRole("button", { name: /Newer Alpha.*controlPanel\.agentRunning/ });
    expect(agentRow).toBeTruthy();

    const plainRow = screen.getByRole("button", { name: /Older Beta/ });
    expect(plainRow.getAttribute("aria-label")).not.toContain("controlPanel.agentRunning");
  });

  it("터미널이 있는 태스크는 터미널 배지를 보여 준다", async () => {
    render(<ControlPanelDialog />);

    openPanel();

    const terminalRow = await screen.findByRole("button", { name: /API Task.*controlPanel\.terminal/ });
    expect(terminalRow).toBeTruthy();

    const plainRow = screen.getByRole("button", { name: /Solo Task/ });
    expect(plainRow.getAttribute("aria-label")).not.toContain("controlPanel.terminal");
  });

  it("필터는 제목·브랜치·프로젝트 이름을 대소문자 무시로 부분 검색한다", async () => {
    render(<ControlPanelDialog />);

    openPanel();

    const input = await screen.findByRole("textbox");

    fireEvent.change(input, { target: { value: "API-SERVER" } });
    expect(await screen.findByRole("button", { name: /API Task/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Newer Alpha/ })).toBeNull();

    fireEvent.change(input, { target: { value: "feat/beta" } });
    expect(await screen.findByRole("button", { name: /Older Beta/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /API Task/ })).toBeNull();
  });

  it("필터 결과가 없으면 빈 상태 문구를 보여 준다", async () => {
    render(<ControlPanelDialog />);

    openPanel();

    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "존재하지않는태스크" } });

    expect(await screen.findByText("controlPanel.empty")).toBeTruthy();
  });

  it("터미널이 있는 태스크에서 Enter를 누르면 view=terminal과 함께 이동한다", async () => {
    render(<ControlPanelDialog />);

    openPanel();

    const input = await screen.findByRole("textbox");
    await screen.findByRole("button", { name: /API Task/ });

    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/en/task/task-api?view=terminal");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("터미널이 없는 태스크에서 Enter를 누르면 쿼리 없이 이동한다", async () => {
    render(<ControlPanelDialog />);

    openPanel();

    const input = await screen.findByRole("textbox");
    await screen.findByRole("button", { name: /Solo Task/ });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/en/task/task-solo");
    });
    expect(mocks.push).not.toHaveBeenCalledWith("/en/task/task-solo?view=terminal");
  });

  it("행을 클릭하면 그 태스크로 이동하고 패널을 닫는다", async () => {
    render(<ControlPanelDialog />);

    openPanel();

    const row = await screen.findByRole("button", { name: /Newer Alpha/ });
    fireEvent.click(row);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/en/task/task-alpha?view=terminal");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape를 누르면 패널을 닫는다", async () => {
    render(<ControlPanelDialog />);

    openPanel();

    const input = await screen.findByRole("textbox");
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("외부 트리거 이벤트(커맨드 팔레트 등)로도 패널을 열 수 있다", async () => {
    render(<ControlPanelDialog />);

    window.dispatchEvent(new Event(CONTROL_PANEL_OPEN_EVENT));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(mocks.getSearchableTasks).toHaveBeenCalled();
  });

  it("단축키가 막힌 상태에서는 열리지 않는다", async () => {
    mocks.hasShortcutBlocker = true;

    render(<ControlPanelDialog />);

    openPanel();

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

