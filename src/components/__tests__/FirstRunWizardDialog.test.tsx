import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FirstRunWizardDialog from "../FirstRunWizardDialog";
const mocks = vi.hoisted(() => ({ tools: vi.fn(), accounts: vi.fn(), save: vi.fn(), scan: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../LanguageSelector", () => ({ default: () => null }));
vi.mock("../FolderSearchInput", () => ({ default: ({ onSelect }: { onSelect: (path: string) => void }) => <button onClick={() => onSelect("D:/project")}>choose folder</button> }));
vi.mock("@/desktop/renderer/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/desktop/renderer/actions/environmentCheck", () => ({ checkEnvironmentAction: mocks.tools }));
vi.mock("@/desktop/renderer/actions/aiAccounts", () => ({ listAiAccounts: mocks.accounts }));
vi.mock("@/desktop/renderer/actions/appSettings", () => ({ setAppSetting: mocks.save }));
vi.mock("@/desktop/renderer/actions/project", () => ({ scanAndRegisterProjects: mocks.scan }));
describe("honest onboarding readiness", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.tools.mockResolvedValue([{ tool: "git", name: "Git", isInstalled: true }, { tool: "claude", name: "Claude Code", isInstalled: true }]); mocks.accounts.mockResolvedValue([{ provider: "claude", accountName: null, isLoggedIn: true }]); mocks.save.mockResolvedValue(undefined); mocks.scan.mockResolvedValue({ registered: [{ id: "p1" }], skipped: [], errors: [] }); });
  it("hides when closed", () => { render(<FirstRunWizardDialog isOpen={false} onComplete={vi.fn()} />); expect(screen.queryByRole("dialog")).toBeNull(); });
  it("blocks continue when sign-in is missing", async () => {
    mocks.accounts.mockResolvedValue([]); render(<FirstRunWizardDialog isOpen onComplete={vi.fn()} />); await screen.findByText("signInClaude"); expect((screen.getByRole("button", { name: "continue" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("skip records seen, never completed", async () => {
    const close = vi.fn(); render(<FirstRunWizardDialog isOpen onComplete={close} />); fireEvent.click(screen.getByRole("button", { name: "skipStep" }));
    await waitFor(() => expect(close).toHaveBeenCalled()); expect(mocks.save).toHaveBeenCalledWith("onboarding_seen", "true"); expect(mocks.save).not.toHaveBeenCalledWith("onboarding_completed", "true");
  });
  it("scans selected folder and opens the first task without declaring completion", async () => {
    const create = vi.fn(); render(<FirstRunWizardDialog isOpen onComplete={vi.fn()} onCreateTask={create} />); await screen.findByText("accountSignedIn"); fireEvent.click(screen.getByRole("button", { name: "continue" }));
    fireEvent.click(screen.getByText("choose folder")); fireEvent.click(screen.getByRole("button", { name: "scanButton" })); await screen.findByText("firstTaskHint"); fireEvent.click(screen.getByTestId("wizard-finish-btn"));
    await waitFor(() => expect(create).toHaveBeenCalled()); expect(mocks.scan).toHaveBeenCalledWith("D:/project"); expect(mocks.save).not.toHaveBeenCalledWith("onboarding_completed", "true");
  });
  it("skipped prerequisites never enable the first run", async () => {
    mocks.accounts.mockResolvedValue([]); render(<FirstRunWizardDialog isOpen onComplete={vi.fn()} />); fireEvent.click(screen.getByText("skipThisStep")); fireEvent.click(screen.getByText("skipThisStep"));
    await screen.findByText("setupIncomplete"); expect((screen.getByTestId("wizard-finish-btn") as HTMLButtonElement).disabled).toBe(true);
  });
  it("failed checks can be rechecked", async () => {
    mocks.tools.mockRejectedValueOnce(new Error("offline")); render(<FirstRunWizardDialog isOpen onComplete={vi.fn()} />); await screen.findByRole("alert"); fireEvent.click(screen.getByText("recheck")); await screen.findByText("accountSignedIn"); expect(mocks.tools).toHaveBeenCalledTimes(2);
  });
});
