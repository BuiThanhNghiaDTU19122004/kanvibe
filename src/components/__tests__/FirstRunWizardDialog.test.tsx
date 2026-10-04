import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";

const mockCheckEnvironment = vi.fn().mockResolvedValue([
  {
    tool: "git",
    name: "Git",
    isInstalled: true,
    version: "git version 2.45.0",
    description: "Version control",
    category: "vcs",
  },
  {
    tool: "claude",
    name: "Claude Code",
    isInstalled: false,
    version: null,
    description: "Claude CLI",
    category: "agent",
    installCommand: "npm i -g @anthropic-ai/claude-code",
  },
]);

const mockSetAppSetting = vi.fn().mockResolvedValue(undefined);
const mockScanAndRegister = vi.fn().mockResolvedValue({
  registered: [{ id: "p1", name: "test-repo" }],
  skipped: [],
  errors: [],
});

vi.mock("@/desktop/renderer/actions/environmentCheck", () => ({
  checkEnvironmentAction: () => mockCheckEnvironment(),
}));

vi.mock("@/desktop/renderer/actions/appSettings", () => ({
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
}));

vi.mock("@/desktop/renderer/actions/project", () => ({
  scanAndRegisterProjects: (...args: unknown[]) => mockScanAndRegister(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const messages: Record<string, string> = {
      title: "Welcome to KanVibe",
      welcomeTitle: "Welcome to KanVibe",
      welcomeSubtitle: "Keyboard-first Kanban workspace",
      step1Title: "1. Verify Environment & AI CLIs",
      step1Description: "KanVibe coordinates with your local coding tools.",
      checkingTools: "Checking installed tools...",
      ready: "Ready",
      notDetected: "Not detected",
      continue: "Continue",
      skipStep: "Skip for now",
      step2Title: "2. Register Your First Project",
      step2Description: "Enter folder path.",
      folderPathLabel: "Project Root Directory",
      scanButton: "Scan & Register",
      scanning: "Scanning...",
      scanTip: "Tip for worktrees",
      step3Title: "3. You are all set!",
      allSetTitle: "Ready to Vibe!",
      allSetDescription: "Environment ready.",
      allSetDescriptionWithProjects: `Successfully registered ${values?.count ?? 0} projects.`,
      getStartedButton: "Open Kanban Board",
    };
    return messages[key] ?? key;
  },
}));

import FirstRunWizardDialog from "../FirstRunWizardDialog";

describe("FirstRunWizardDialog", () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not render when isOpen is false", () => {
    render(<FirstRunWizardDialog isOpen={false} onComplete={onComplete} />);
    expect(screen.queryByTestId("first-run-wizard-dialog")).toBeNull();
  });

  it("renders step 1 with verified tools and navigates to step 2", async () => {
    render(<FirstRunWizardDialog isOpen={true} onComplete={onComplete} />);

    expect(screen.getByTestId("first-run-wizard-dialog")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Git")).toBeTruthy();
      expect(screen.getByText("Claude Code")).toBeTruthy();
      expect(screen.getByText(/Ready/i)).toBeTruthy();
      expect(screen.getByText("Not detected")).toBeTruthy();
    });

    const continueBtn = screen.getByText(/Continue/i);
    fireEvent.click(continueBtn);

    expect(screen.getByText("2. Register Your First Project")).toBeTruthy();
  });

  it("completes wizard and sets onboarding_completed setting", async () => {
    render(<FirstRunWizardDialog isOpen={true} onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText("Git")).toBeTruthy();
    });

    // Skip to step 2
    fireEvent.click(screen.getByText(/Continue/i));
    // Skip to step 3
    fireEvent.click(screen.getByText(/Skip for now/i));

    expect(screen.getByText("Ready to Vibe!")).toBeTruthy();

    const finishBtn = screen.getByTestId("wizard-finish-btn");
    fireEvent.click(finishBtn);

    await waitFor(() => {
      expect(mockSetAppSetting).toHaveBeenCalledWith("onboarding_completed", "true");
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});
