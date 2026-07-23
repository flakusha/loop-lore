/**
 * Frontend i18n utilities — unit tests
 */

import { beforeEach, describe, expect, it, } from "bun:test";
import {
  createFrontendTranslator,
  DEFAULT_LOCALE,
  flattenTranslations,
  getSavedLocale,
  interpolate,
  LOCALE_REGISTRY,
  resolveKey,
  saveLocale,
  SUPPORTED_LOCALES,
} from "../i18n";

// Mock localStorage for Bun test environment
const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string,) => storage.get(key,) ?? null,
  setItem: (key: string, value: string,) => {
    storage.set(key, value,);
  },
  removeItem: (key: string,) => {
    storage.delete(key,);
  },
  clear: () => {
    storage.clear();
  },
  get length() {
    return storage.size;
  },
  key: (index: number,) => [...storage.keys(),][index] ?? null,
};
Object.defineProperty(globalThis, "localStorage", { value: mockLocalStorage, writable: true, },);

// Mock document for cookie and DOM operations
const mockDocument = {
  cookie: "",
  documentElement: {
    lang: "en",
    dir: "ltr",
  },
};
Object.defineProperty(globalThis, "document", { value: mockDocument, writable: true, },);

describe("resolveKey", () => {
  const map = {
    common: { save: "Save", cancel: "Cancel", },
    auth: { login: "Log In", },
    deeply: { nested: { key: "Found", }, },
  };

  it("resolves simple nested key", () => {
    expect(resolveKey(map, "common.save",),).toBe("Save",);
    expect(resolveKey(map, "auth.login",),).toBe("Log In",);
  });

  it("resolves deeply nested key", () => {
    expect(resolveKey(map, "deeply.nested.key",),).toBe("Found",);
  });

  it("returns undefined for missing key", () => {
    expect(resolveKey(map, "missing",),).toBeUndefined();
    expect(resolveKey(map, "common.missing",),).toBeUndefined();
    expect(resolveKey(map, "a.b.c.d",),).toBeUndefined();
  });

  it("returns undefined when path crosses non-object", () => {
    expect(resolveKey(map, "common.save.something",),).toBeUndefined();
  });
});

describe("flattenTranslations", () => {
  it("flattens nested map to dot-notation", () => {
    const nested = { common: { save: "Save", cancel: "Cancel", }, };
    const flat = flattenTranslations(nested,);
    expect(flat.get("common.save",),).toBe("Save",);
    expect(flat.get("common.cancel",),).toBe("Cancel",);
    expect(flat.size,).toBe(2,);
  });

  it("handles empty map", () => {
    expect(flattenTranslations({},).size,).toBe(0,);
  });
});

describe("interpolate", () => {
  it("replaces {param} placeholders", () => {
    expect(interpolate("Hello {name}", { name: "World", },),).toBe("Hello World",);
  });

  it("keeps missing params as-is", () => {
    expect(interpolate("Hello {name}", {},),).toBe("Hello {name}",);
  });

  it("replaces multiple params", () => {
    expect(interpolate("{a} and {b}", { a: "X", b: "Y", },),).toBe("X and Y",);
  });
});

describe("getSavedLocale", () => {
  beforeEach(() => {
    storage.clear();
  },);

  it("returns default when no saved locale", () => {
    expect(getSavedLocale(),).toBe(DEFAULT_LOCALE,);
  });

  it("returns saved locale when valid", () => {
    storage.set("locale", "ja",);
    expect(getSavedLocale(),).toBe("ja",);
  });

  it("returns default for invalid locale", () => {
    storage.set("locale", "xx",);
    expect(getSavedLocale(),).toBe(DEFAULT_LOCALE,);
  });
});

describe("saveLocale", () => {
  beforeEach(() => {
    storage.clear();
    mockDocument.cookie = "";
    mockDocument.documentElement.lang = "en";
    mockDocument.documentElement.dir = "ltr";
  },);

  it("saves locale to localStorage", () => {
    saveLocale("ja",);
    expect(storage.get("locale",),).toBe("ja",);
  });

  it("overwrites previous locale", () => {
    saveLocale("ja",);
    saveLocale("fr",);
    expect(storage.get("locale",),).toBe("fr",);
  });
});

describe("createFrontendTranslator", () => {
  it("returns primary translation when available", () => {
    const translations = { auth: { login: "Iniciar sesión", }, };
    const t = createFrontendTranslator(translations,);
    expect(t("auth.login",),).toBe("Iniciar sesión",);
  });

  it("returns key path when translation missing", () => {
    const translations = {};
    const t = createFrontendTranslator(translations,);
    expect(t("auth.login",),).toBe("auth.login",);
  });

  it("interpolates parameters", () => {
    const translations = { greeting: { hello: "Hola {name}", }, };
    const t = createFrontendTranslator(translations,);
    expect(t("greeting.hello", { name: "Mundo", },),).toBe("Hola Mundo",);
  });

  it("falls back to fallback locale translations", () => {
    const primary = {};
    const fallback = { auth: { login: "Log In", }, };
    const t = createFrontendTranslator(primary, fallback,);
    expect(t("auth.login",),).toBe("Log In",);
  });

  it("returns key path for deeply nested missing key", () => {
    const translations = { common: { save: "Guardar", }, };
    const t = createFrontendTranslator(translations,);
    expect(t("deeply.nested.missing",),).toBe("deeply.nested.missing",);
  });
});

describe("SUPPORTED_LOCALES", () => {
  it("contains all 10 locales", () => {
    expect(SUPPORTED_LOCALES.length,).toBe(10,);
  });

  it("includes en", () => {
    expect(SUPPORTED_LOCALES,).toContain("en",);
  });
});

describe("LOCALE_REGISTRY", () => {
  it("has metadata for all locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const info = LOCALE_REGISTRY[locale];
      expect(info,).toBeDefined();
      expect(info.id,).toBe(locale,);
      expect(info.name,).toBeTruthy();
      expect(info.nativeName,).toBeTruthy();
      expect(["ltr", "rtl",],).toContain(info.direction,);
    }
  });

  it("arabic is RTL", () => {
    expect(LOCALE_REGISTRY.ar.direction,).toBe("rtl",);
  });

  it("english is LTR", () => {
    expect(LOCALE_REGISTRY.en.direction,).toBe("ltr",);
  });
});
