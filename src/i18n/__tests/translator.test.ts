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
import { pluralRuleFor, } from "../plurals";
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
    expect(resolveKey({ translations: map, key: "auth.login", },),).toBe("Log In",);
  });

  it("returns undefined for missing key", () => {
    const map = new Map([["auth.login", "Log In",],],);
    expect(resolveKey({ translations: map, key: "auth.logout", },),).toBeUndefined();
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

describe("plural rules (Intl.PluralRules)", () => {
  const EN: TranslationMap = {
    inventory: {
      item: { one: "{count} item", other: "{count} items", },
    },
  };
  const RU: TranslationMap = {
    inventory: {
      item: {
        one: "{count} товар",
        few: "{count} товара",
        many: "{count} товаров",
        other: "{count} товара",
      },
    },
  };

  it("pluralRuleFor picks the locale's own categories, not count === 1", () => {
    const en = pluralRuleFor("en");
    expect([en(0), en(1), en(2), en(5),]).toEqual(["other", "one", "other", "other",],);

    // ru: a naive `count === 1 ? one : other` gets every one of these wrong.
    const ru = pluralRuleFor("ru");
    expect([ru(1), ru(2), ru(5), ru(11), ru(21),]).toEqual([
      "one",
      "few",
      "many",
      "many",
      "one",
    ],);
  });

  it("pluralRuleFor reports the extra zero/two categories for Arabic", () => {
    const ar = pluralRuleFor("ar");
    expect([ar(0), ar(1), ar(2), ar(11),]).toEqual(["zero", "one", "two", "many",],);
  });

  it("selects English one/other from a two-category catalog", () => {
    const t = createTranslator({ primary: flattenTranslations(EN,), locale: "en", },);
    expect(t("inventory.item", { count: 1, },),).toBe("1 item");
    expect(t("inventory.item", { count: 2, },),).toBe("2 items");
    // 0 is NOT "one" in English — CLDR routes it to `other`.
    expect(t("inventory.item", { count: 0, },),).toBe("0 items");
  });

  it("selects Russian one/few/many from the same catalog shape", () => {
    const t = createTranslator({ primary: flattenTranslations(RU,), locale: "ru", },);
    expect(t("inventory.item", { count: 1, },),).toBe("1 товар");
    expect(t("inventory.item", { count: 3, },),).toBe("3 товара");
    expect(t("inventory.item", { count: 5, },),).toBe("5 товаров");
    expect(t("inventory.item", { count: 21, },),).toBe("21 товар");
  });

  it("falls back to `other` when the selected category is absent", () => {
    const partial = flattenTranslations({
      inventory: { item: { one: "{count} item", other: "{count} items (fallback)", }, },
    },);
    const t = createTranslator({ primary: partial, locale: "ru", },);
    // ru 2 selects `few`, which this catalog does not define.
    expect(t("inventory.item", { count: 2, },),).toBe("2 items (fallback)");
    // `one` is present, so it still wins when the rule asks for it.
    expect(t("inventory.item", { count: 1, },),).toBe("1 item");
  });

  it("consults the fallback catalog for a key missing from the primary locale", () => {
    const primary = flattenTranslations({ common: { save: "Enregistrer", }, },);
    const fallback = flattenTranslations(EN,);
    const t = createTranslator({ primary, fallback, locale: "ru", },);
    // Primary has no `inventory.item`, so the fallback's one/other table applies
    // — and the ru rule still drives the selection.
    expect(t("inventory.item", { count: 1, },),).toBe("1 item");
    expect(t("inventory.item", { count: 4, },),).toBe("4 items");
  });

  it("returns `other` when no count is supplied for a plural key", () => {
    const t = createTranslator({ primary: flattenTranslations(EN,), locale: "en", },);
    expect(t("inventory.item",),).toBe("{count} items");
  });

  it("treats a string `count` as a non-plural param, not a category driver", () => {
    const t = createTranslator({ primary: flattenTranslations(EN,), locale: "en", },);
    // Legacy call sites pass String(ids.length): only a NUMERIC count drives
    // plural selection, so a string skips it and takes the `other` variant —
    // which is what the shipped `{count} chat(s)` strings already assume.
    expect(t("inventory.item", { count: "2", },),).toBe("2 items");
  });

  it("leaves plain-string keys untouched when a count is passed", () => {
    const primary = flattenTranslations({ greeting: "Hello, {name}!", },);
    const t = createTranslator({ primary, locale: "ru", },);
    expect(t("greeting", { name: "World", count: 5, },),).toBe("Hello, World!");
  });

  it("does not descend into a plural object, and does not treat an enum as one", () => {
    const flat = flattenTranslations({
      chat: { flagReason: { inappropriate: "Bad", other: "Other", }, },
      inventory: { item: { one: "1 item", other: "n items", }, },
    },);
    // Plural node stays whole under its own key.
    expect(flat.get("inventory.item",),).toEqual({ one: "1 item", other: "n items", },);
    expect(flat.has("inventory.item.one",),).toBe(false);
    // An enumeration that merely CONTAINS `other` is still a normal subtree.
    expect(flat.get("chat.flagReason.other",),).toBe("Other");
    expect(flat.has("chat.flagReason",),).toBe(false);
  });

  it("interpolates other params alongside the plural-selected variant", () => {
    const primary = flattenTranslations({
      cart: { summary: { one: "{name}: {count} item", other: "{name}: {count} items", }, },
    },);
    const t = createTranslator({ primary, locale: "en", },);
    expect(t("cart.summary", { name: "Ada", count: 1, },),).toBe("Ada: 1 item");
    expect(t("cart.summary", { name: "Ada", count: 7, },),).toBe("Ada: 7 items");
  });

  it("honours an explicit pluralRule override over the locale default", () => {
    const primary = flattenTranslations(EN,);
    const t = createTranslator({
      primary,
      locale: "en",
      pluralRule: (count: number,) => (count > 10 ? "one" : "other"),
    },);
    expect(t("inventory.item", { count: 50, },),).toBe("50 item");
    expect(t("inventory.item", { count: 2, },),).toBe("2 items");
  });

  it("returns the raw key for a plural key absent from every catalog", () => {
    const t = createTranslator({ primary: new Map(), locale: "ru", },);
    expect(t("inventory.missing", { count: 2, },),).toBe("inventory.missing");
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
