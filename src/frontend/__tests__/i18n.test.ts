/**
 * Frontend i18n utilities — unit tests
 */

import { describe, expect, it, beforeEach } from "bun:test";
import {
  resolveKey,
  flattenTranslations,
  interpolate,
  getSavedLocale,
  SUPPORTED_LOCALES,
  LOCALE_REGISTRY,
  DEFAULT_LOCALE,
} from "../i18n";

// Mock localStorage for Bun test environment
const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
  get length() { return storage.size; },
  key: (index: number) => [...storage.keys()][index] ?? null,
};
Object.defineProperty(globalThis, "localStorage", { value: mockLocalStorage, writable: true });

describe("resolveKey", () => {
  const map = {
    common: { save: "Save", cancel: "Cancel" },
    auth: { login: "Log In" },
    deeply: { nested: { key: "Found" } },
  };

  it("resolves simple nested key", () => {
    expect(resolveKey(map, "common.save")).toBe("Save");
    expect(resolveKey(map, "auth.login")).toBe("Log In");
  });

  it("resolves deeply nested key", () => {
    expect(resolveKey(map, "deeply.nested.key")).toBe("Found");
  });

  it("returns undefined for missing key", () => {
    expect(resolveKey(map, "missing")).toBeUndefined();
    expect(resolveKey(map, "common.missing")).toBeUndefined();
    expect(resolveKey(map, "a.b.c.d")).toBeUndefined();
  });

  it("returns undefined when path crosses non-object", () => {
    expect(resolveKey(map, "common.save.something")).toBeUndefined();
  });
});

describe("flattenTranslations", () => {
  it("flattens nested map to dot-notation", () => {
    const nested = { common: { save: "Save", cancel: "Cancel" } };
    const flat = flattenTranslations(nested);
    expect(flat.get("common.save")).toBe("Save");
    expect(flat.get("common.cancel")).toBe("Cancel");
    expect(flat.size).toBe(2);
  });

  it("handles empty map", () => {
    expect(flattenTranslations({}).size).toBe(0);
  });
});

describe("interpolate", () => {
  it("replaces {param} placeholders", () => {
    expect(interpolate("Hello {name}", { name: "World" })).toBe("Hello World");
  });

  it("keeps missing params as-is", () => {
    expect(interpolate("Hello {name}", {})).toBe("Hello {name}");
  });

  it("replaces multiple params", () => {
    expect(interpolate("{a} and {b}", { a: "X", b: "Y" })).toBe("X and Y");
  });
});

describe("getSavedLocale", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("returns default when no saved locale", () => {
    expect(getSavedLocale()).toBe(DEFAULT_LOCALE);
  });

  it("returns saved locale when valid", () => {
    storage.set("locale", "ja");
    expect(getSavedLocale()).toBe("ja");
  });

  it("returns default for invalid locale", () => {
    storage.set("locale", "xx");
    expect(getSavedLocale()).toBe(DEFAULT_LOCALE);
  });
});

describe("SUPPORTED_LOCALES", () => {
  it("contains all 10 locales", () => {
    expect(SUPPORTED_LOCALES.length).toBe(10);
  });

  it("includes en", () => {
    expect(SUPPORTED_LOCALES).toContain("en");
  });
});

describe("LOCALE_REGISTRY", () => {
  it("has metadata for all locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const info = LOCALE_REGISTRY[locale];
      expect(info).toBeDefined();
      expect(info.id).toBe(locale);
      expect(info.name).toBeTruthy();
      expect(info.nativeName).toBeTruthy();
      expect(["ltr", "rtl"]).toContain(info.direction);
    }
  });

  it("arabic is RTL", () => {
    expect(LOCALE_REGISTRY.ar.direction).toBe("rtl");
  });

  it("english is LTR", () => {
    expect(LOCALE_REGISTRY.en.direction).toBe("ltr");
  });
});
