import { describe, expect, it } from "vitest";
import enMessages from "../../../../../messages/en.json";
import viMessages from "../../../../../messages/vi.json";
import koMessages from "../../../../../messages/ko.json";
import zhMessages from "../../../../../messages/zh.json";
import { getLocaleMessages, SUPPORTED_LOCALES } from "../locales";

function getLeafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...getLeafKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe("Locale message parity", () => {
  const enKeys = getLeafKeys(enMessages);
  const viKeys = getLeafKeys(viMessages);
  const koKeys = getLeafKeys(koMessages);
  const zhKeys = getLeafKeys(zhMessages);

  it("en and vi have full key parity", () => {
    const missingInVi = enKeys.filter((k) => !viKeys.includes(k));
    const extraInVi = viKeys.filter((k) => !enKeys.includes(k));
    expect(missingInVi).toEqual([]);
    expect(extraInVi).toEqual([]);
  });

  it("en and ko have full key parity", () => {
    const missingInKo = enKeys.filter((k) => !koKeys.includes(k));
    const extraInKo = koKeys.filter((k) => !enKeys.includes(k));
    expect(missingInKo).toEqual([]);
    expect(extraInKo).toEqual([]);
  });

  it("en and zh have full key parity", () => {
    const missingInZh = enKeys.filter((k) => !zhKeys.includes(k));
    const extraInZh = zhKeys.filter((k) => !enKeys.includes(k));
    expect(missingInZh).toEqual([]);
    expect(extraInZh).toEqual([]);
  });

  it("resolves merged messages for each supported locale with fallback to en", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const messages = getLocaleMessages(locale);
      expect(messages).toBeDefined();
      expect(typeof messages).toBe("object");
      expect(Object.keys(messages).length).toBeGreaterThan(0);
    }
  });
});
