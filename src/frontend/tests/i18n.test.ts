/**
 * Frontend i18n utilities — unit tests
 */

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
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
  addEventListener: () => {},
};

Object.defineProperty(globalThis, "document", { value: mockDocument, writable: true, },);

// Dynamic import for ui.ts to avoid module-level side effects
let t: (key: string, params?: Record<string, string>,) => string;
let savedLocaleStrings: unknown;
// Sentinel, not `savedLocaleStrings !== undefined`: when this file runs FIRST in a
// worker nothing has populated `__localeStrings` yet, so the snapshot is legitimately
// undefined and an undefined-check would skip the restore entirely — leaking the
// {common,greeting} stub below into later files in the worker.
let hasSavedLocaleStrings = false;
const localeStringsHost = globalThis as { __localeStrings?: unknown };
beforeEach(async () => {
  const ui = await import("../ui");
  t = ui.t;
},);

// The `globalThis.t (from ui.ts)` describe block below overwrites `__localeStrings`
// with a stub map in its nested `beforeEach`. Save the pre-test value before each
// overwrite and restore it afterward so downstream tests in the same bun:test process
// (e.g. gif-picker.test.ts) keep the real en.json catalog loaded by i18n.test-helper.
afterEach(() => {
  if (!hasSavedLocaleStrings) { return; }
  localeStringsHost.__localeStrings = savedLocaleStrings;
  hasSavedLocaleStrings = false;
},);

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

  it("returns undefined for non-string key", () => {
    expect(resolveKey(map, undefined as unknown as string,),).toBeUndefined();
    expect(resolveKey(map, null as unknown as string,),).toBeUndefined();
    expect(resolveKey(map, 42 as unknown as string,),).toBeUndefined();
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

describe("globalThis.t (from ui.ts)", () => {
  beforeEach(() => {
    // Snapshot whatever's currently in `__localeStrings` so the afterEach hook
    // above can restore it after this describe block runs. Without this the
    // stubbed map below would leak into later test files in the same worker.
    savedLocaleStrings = localeStringsHost.__localeStrings;
    hasSavedLocaleStrings = true;
    localeStringsHost.__localeStrings = {
      common: { save: "Save", cancel: "Cancel", },
      greeting: { hello: "Hello {name}", },
    } as Record<string, unknown>;
  },);

  it("returns translated string for valid key", () => {
    expect(t("common.save",),).toBe("Save",);
  });

  it("returns key fallback when missing", () => {
    expect(t("missing.key",),).toBe("missing.key",);
  });

  it("interpolates params", () => {
    expect(t("greeting.hello", { name: "World", },),).toBe("Hello World",);
  });

  it("returns empty string for non-string key (TypeError guard)", () => {
    expect(t(undefined as unknown as string,),).toBe("",);
    expect(t(null as unknown as string,),).toBe("",);
    expect(t(42 as unknown as string,),).toBe("",);
    expect(t({} as unknown as string,),).toBe("",);
  });
});

// Declared last so it runs after the `globalThis.t` block installs the stub.
describe("locale-string restore guard", () => {
  it("leaves no {common,greeting} stub for later files in this worker", () => {
    const current = localeStringsHost.__localeStrings as Record<string, unknown> | undefined;
    // The stub is the only place {common,greeting} appears. If the restore guard
    // silently skipped -- the old `!== undefined` check, which is wrong exactly
    // when this file runs first in its worker and nothing has populated
    // `__localeStrings` yet -- the stub survives into gif-picker.test.ts, which
    // then resolves raw keys instead of the real en.json strings.
    expect(current?.greeting,).toBeUndefined();
    expect(current?.common,).toBeUndefined();
  });
});
