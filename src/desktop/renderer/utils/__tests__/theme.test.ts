import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  applyThemePreference,
  notifyThemePreferenceChanged,
  resolveThemePreference,
  THEME_PREFERENCE_CHANGED_EVENT,
} from "../theme";

describe("theme utils", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "";
    document.documentElement.dataset.themePreference = "";
    document.documentElement.style.colorScheme = "";
  });

  describe("resolveThemePreference", () => {
    it("returns explicit themes directly", () => {
      expect(resolveThemePreference("dark")).toBe("dark");
      expect(resolveThemePreference("light")).toBe("light");
      expect(resolveThemePreference("dracula")).toBe("dracula");
      expect(resolveThemePreference("one-dark")).toBe("one-dark");
      expect(resolveThemePreference("catppuccin-mocha")).toBe("catppuccin-mocha");
    });

    it("resolves system preference based on matchMedia", () => {
      const matchMediaSpy = vi.fn().mockReturnValue({ matches: true });
      window.matchMedia = matchMediaSpy as unknown as typeof window.matchMedia;

      expect(resolveThemePreference("system")).toBe("light");
      expect(matchMediaSpy).toHaveBeenCalledWith("(prefers-color-scheme: light)");

      matchMediaSpy.mockReturnValue({ matches: false });
      expect(resolveThemePreference("system")).toBe("dark");
    });
  });

  describe("applyThemePreference", () => {
    it("sets documentElement datasets, style.colorScheme, and calls updateTitleBarOverlay", () => {
      const mockUpdateTitleBar = vi.fn();
      window.kanvibeDesktop = {
        ...(window.kanvibeDesktop || {}),
        updateTitleBarOverlay: mockUpdateTitleBar,
      } as unknown as typeof window.kanvibeDesktop;

      applyThemePreference("dracula");

      expect(document.documentElement.dataset.themePreference).toBe("dracula");
      expect(document.documentElement.dataset.theme).toBe("dracula");
      expect(document.documentElement.style.colorScheme).toBe("dark");
      expect(mockUpdateTitleBar).toHaveBeenCalledWith("dracula");

      applyThemePreference("light");
      expect(document.documentElement.dataset.themePreference).toBe("light");
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(document.documentElement.style.colorScheme).toBe("light");
      expect(mockUpdateTitleBar).toHaveBeenCalledWith("light");
    });
  });

  describe("notifyThemePreferenceChanged", () => {
    it("dispatches custom event with the theme preference detail", () => {
      let receivedTheme: string | null = null;
      const listener = (event: Event) => {
        receivedTheme = (event as CustomEvent).detail;
      };

      window.addEventListener(THEME_PREFERENCE_CHANGED_EVENT, listener);
      notifyThemePreferenceChanged("catppuccin-mocha");

      expect(receivedTheme).toBe("catppuccin-mocha");
      window.removeEventListener(THEME_PREFERENCE_CHANGED_EVENT, listener);
    });
  });
});
