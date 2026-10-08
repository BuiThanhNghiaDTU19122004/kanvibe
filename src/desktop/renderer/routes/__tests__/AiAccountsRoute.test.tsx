import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiAccountSummary } from "@/desktop/main/services/aiAccountService";

const mocks = vi.hoisted(() => ({ listAiAccounts: vi.fn(), addAiAccount: vi.fn(), removeAiAccount: vi.fn() }));
vi.mock("@/desktop/renderer/actions/aiAccounts", () => mocks);
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/desktop/renderer/components/AiUsagePanel", () => ({ default: () => <div data-testid="usage-panel">usage</div> }));
vi.mock("@/desktop/renderer/hooks/useAiUsage", () => ({ invalidateAiUsage: vi.fn() }));
let AiAccountsRoute: typeof import("../AiAccountsRoute").default;

describe("AiAccountsRoute loading", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    AiAccountsRoute = (await import("../AiAccountsRoute")).default;
  });
  it("shows the page and usage before CLI account checks finish", async () => {
    let resolve: (accounts: AiAccountSummary[]) => void = () => {};
    mocks.listAiAccounts.mockReturnValue(new Promise<AiAccountSummary[]>((done) => { resolve = done; }));
    render(<AiAccountsRoute />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("title");
    expect(screen.getByTestId("usage-panel")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    resolve([]);
    await screen.findByTestId("ai-accounts-provider-claude");
  });
  it("keeps usage visible if account loading fails", async () => {
    mocks.listAiAccounts.mockRejectedValue(new Error("CLI unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<AiAccountsRoute />);
      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
      expect(screen.getByTestId("usage-panel")).toBeTruthy();
      expect(screen.getByRole("button", { name: "retry" })).toBeTruthy();
    } finally { error.mockRestore(); }
  });
  it("reuses account data when returning to the page within one minute", async () => {
    mocks.listAiAccounts.mockResolvedValue([]);
    const first = render(<AiAccountsRoute />);
    await screen.findByTestId("ai-accounts-provider-claude");
    first.unmount();
    render(<AiAccountsRoute />);
    expect(screen.getByTestId("ai-accounts-provider-claude")).toBeTruthy();
    expect(mocks.listAiAccounts).toHaveBeenCalledTimes(1);
  });
});
