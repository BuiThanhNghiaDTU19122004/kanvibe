import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsRoute from "../SettingsRoute";

const getters = vi.hoisted(() => ({
  getThemePreference: vi.fn(), getSidebarDefaultCollapsed: vi.fn(), getDefaultSessionType: vi.fn(),
  getNotificationSettings: vi.fn(), getBackgroundSyncSettings: vi.fn(), getVimModeEnabled: vi.fn(),
}));
vi.mock("@/desktop/renderer/actions/appSettings", () => getters);
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/desktop/renderer/utils/refresh", () => ({ useRefreshSignal: () => 0 }));
vi.mock("@/components/ProjectSettings", () => ({ default: ({ section }: { section: string }) => <div data-testid="selected-settings">{section}</div> }));

describe("SettingsRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getters.getThemePreference.mockResolvedValue("dark");
    getters.getSidebarDefaultCollapsed.mockResolvedValue(false);
    getters.getDefaultSessionType.mockResolvedValue("terminal");
    getters.getNotificationSettings.mockResolvedValue({ isEnabled: true, enabledStatuses: ["progress"] });
    getters.getBackgroundSyncSettings.mockResolvedValue({ isEnabled: true, intervalMs: 600_000 });
    getters.getVimModeEnabled.mockResolvedValue(true);
  });
  it.each([
    ["appearance", "getThemePreference"], ["detail", "getSidebarDefaultCollapsed"],
    ["creation", "getDefaultSessionType"], ["notifications", "getNotificationSettings"],
    ["background-sync", "getBackgroundSyncSettings"], ["keyboard", "getVimModeEnabled"],
  ] as const)("loads only the data needed by %s", async (section, getter) => {
    render(<MemoryRouter initialEntries={[`/settings/${section}`]}>
      <Routes><Route path="settings"><Route path=":section" element={<SettingsRoute />} /></Route></Routes>
    </MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("selected-settings").textContent).toBe(section));
    for (const [name, mock] of Object.entries(getters)) {
      expect(mock).toHaveBeenCalledTimes(name === getter ? 1 : 0);
    }
  });
  it("redirects an unknown section to appearance", async () => {
    render(<MemoryRouter initialEntries={["/settings/unknown"]}>
      <Routes><Route path="settings"><Route path=":section" element={<SettingsRoute />} /></Route></Routes>
    </MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("selected-settings").textContent).toBe("appearance"));
  });
});
