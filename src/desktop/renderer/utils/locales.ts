import enMessages from "../../../../messages/en.json";
import koMessages from "../../../../messages/ko.json";
import zhMessages from "../../../../messages/zh.json";
import viMessages from "../../../../messages/vi.json";

export const DEFAULT_LOCALE = "en";
export const SUPPORTED_LOCALES = ["ko", "en", "zh", "vi"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const messagesByLocale: Record<SupportedLocale, Record<string, unknown>> = {
  en: enMessages,
  ko: koMessages,
  zh: zhMessages,
  vi: viMessages,
};

export function getLocaleMessages(locale: SupportedLocale): Record<string, unknown> {
  function merge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
    const result = { ...base };
    for (const [key, value] of Object.entries(override)) {
      const previous = result[key];
      result[key] = value && typeof value === "object" && previous && typeof previous === "object"
        ? merge(previous as Record<string, unknown>, value as Record<string, unknown>) : value;
    }
    return result;
  }
  return merge(messagesByLocale.en, messagesByLocale[locale]);
}

export function readLocalePreference(): SupportedLocale {
  try { return getSafeLocale(localStorage.getItem("kanvibe:locale") ?? undefined); }
  catch { return DEFAULT_LOCALE; }
}

export function saveLocalePreference(locale: string) {
  try { localStorage.setItem("kanvibe:locale", getSafeLocale(locale)); } catch { /* Storage can be unavailable in previews. */ }
}

export function isSupportedLocale(locale: string | undefined): locale is SupportedLocale {
  return !!locale && SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

export function getSafeLocale(locale: string | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}
