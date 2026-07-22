/**
 * i18n Module Tests
 */

import { describe, expect, it, } from "bun:test";
import {
  getLocaleInfo,
  getSupportedLocales,
  isLocale,
  LOCALE_REGISTRY,
} from "../locale-registry";
import {
  createTranslator,
  flattenTranslations,
  interpolate,
  resolveKey,
} from "../translator";
import type { TranslationMap, } from "../types";

describe("flattenTranslations", () => {
  it("flattens nested map to dot-notation", () => {
    const nested: TranslationMap = {
      auth: {
        login: "Log In",
        logout: "Log Out",
      },
      common: {
        save: "Save",
      },
    };

    const flat = flattenTranslations(nested,);

    expect(flat.get("auth.login",),).toBe("Log In",);
    expect(flat.get("auth.logout",),).toBe("Log Out",);
    expect(flat.get("common.save",),).toBe("Save",);
  });

  it("handles single-level keys", () => {
    const flat = flattenTranslations({ hello: "Hello", },);
    expect(flat.get("hello",),).toBe("Hello",);
  });
});

describe("resolveKey", () => {
  it("resolves existing key", () => {
    const map = new Map([["auth.login", "Log In",],],);
    expect(resolveKey(map, "auth.login",),).toBe("Log In",);
  });

  it("returns undefined for missing key", () => {
    const map = new Map([["auth.login", "Log In",],],);
    expect(resolveKey(map, "auth.logout",),).toBeUndefined();
  });
});

describe("interpolate", () => {
  it("replaces {param} placeholders", () => {
    expect(interpolate("Hello, {name}!", { name: "World", },),).toBe("Hello, World!",);
  });

  it("leaves unmatched placeholders intact", () => {
    expect(interpolate("Hello, {name}!", {},),).toBe("Hello, {name}!",);
  });

  it("handles multiple params", () => {
    expect(interpolate("{greeting}, {name}!", { greeting: "Hi", name: "Alice", },),).toBe("Hi, Alice!",);
  });
});

describe("createTranslator", () => {
  it("returns primary translation", () => {
    const primary = new Map([["auth.login", "Iniciar sesión",],],);
    const t = createTranslator({ primary, locale: "es", },);
    expect(t("auth.login",),).toBe("Iniciar sesión",);
  });

  it("falls back to fallback locale", () => {
    const primary = new Map<string, string>();
    const fallback = new Map([["auth.login", "Log In",],],);
    const t = createTranslator({ primary, fallback, locale: "es", },);
    expect(t("auth.login",),).toBe("Log In",);
  });

  it("returns key when no translation found", () => {
    const primary = new Map<string, string>();
    const t = createTranslator({ primary, locale: "es", },);
    expect(t("missing.key",),).toBe("missing.key",);
  });

  it("interpolates params", () => {
    const primary = new Map([["greeting", "Hello, {name}!",],],);
    const t = createTranslator({ primary, locale: "en", },);
    expect(t("greeting", { name: "World", },),).toBe("Hello, World!",);
  });
});

describe("locale-registry", () => {
  it("has all 10 locales", () => {
    expect(getSupportedLocales(),).toHaveLength(10,);
  });

  it("identifies valid locales", () => {
    expect(isLocale("en",),).toBe(true,);
    expect(isLocale("ja",),).toBe(true,);
    expect(isLocale("xx",),).toBe(false,);
  });

  it("returns locale info", () => {
    const info = getLocaleInfo("ja",);
    expect(info?.name,).toBe("Japanese",);
    expect(info?.nativeName,).toBe("日本語",);
    expect(info?.direction,).toBe("ltr",);
  });

  it("marks Arabic as RTL", () => {
    const info = getLocaleInfo("ar",);
    expect(info?.direction,).toBe("rtl",);
  });
});

describe("LOCALE_REGISTRY", () => {
  it("contains all required locales", () => {
    const required = ["en", "es", "fr", "de", "ja", "ko", "zh", "pt", "ru", "ar",];
    for (const locale of required) {
      expect(LOCALE_REGISTRY[locale as keyof typeof LOCALE_REGISTRY],).toBeDefined();
    }
  });
});
