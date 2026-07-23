/**
 * Frontend i18n tests
 */

import { describe, expect, it, } from "bun:test";
import {
  DEFAULT_LOCALE,
  flattenTranslations,
  interpolate,
  resolveKey,
  SUPPORTED_LOCALES,
  type TranslationMap,
} from "./i18n";

describe("resolveKey", () => {
  it("resolves a simple key", () => {
    const map: TranslationMap = { greeting: "Hello", };
    expect(resolveKey(map, "greeting",),).toBe("Hello",);
  });

  it("resolves nested keys", () => {
    const map: TranslationMap = { auth: { login: "Log In", logout: "Log Out", }, };
    expect(resolveKey(map, "auth.login",),).toBe("Log In",);
    expect(resolveKey(map, "auth.logout",),).toBe("Log Out",);
  });

  it("returns undefined for missing keys", () => {
    const map: TranslationMap = { greeting: "Hello", };
    expect(resolveKey(map, "missing",),).toBeUndefined();
  });

  it("returns undefined for partial nested keys", () => {
    const map: TranslationMap = { auth: { login: "Log In", }, };
    expect(resolveKey(map, "auth",),).toBeUndefined();
  });
});

describe("flattenTranslations", () => {
  it("flattens nested structure", () => {
    const map: TranslationMap = {
      common: { save: "Save", cancel: "Cancel", },
      auth: { login: "Log In", },
    };
    const result = flattenTranslations(map,);

    expect(result.get("common.save",),).toBe("Save",);
    expect(result.get("common.cancel",),).toBe("Cancel",);
    expect(result.get("auth.login",),).toBe("Log In",);
  });

  it("handles empty map", () => {
    const result = flattenTranslations({},);
    expect(result.size,).toBe(0,);
  });
});

describe("interpolate", () => {
  it("replaces single placeholder", () => {
    expect(interpolate("Hello, {name}!", { name: "World", },),).toBe("Hello, World!",);
  });

  it("replaces multiple placeholders", () => {
    expect(
      interpolate("{greeting}, {name}! Welcome to {place}.", {
        greeting: "Hello",
        name: "World",
        place: "loop-lore",
      },),
    ).toBe("Hello, World! Welcome to loop-lore.",);
  });

  it("leaves missing placeholders unchanged", () => {
    expect(interpolate("Hello, {name}!", {},),).toBe("Hello, {name}!",);
  });

  it("handles empty params", () => {
    expect(interpolate("Hello, World!", {},),).toBe("Hello, World!",);
  });
});

describe("locale utilities", () => {
  it("has supported locales", () => {
    expect(SUPPORTED_LOCALES,).toContain("en",);
    expect(SUPPORTED_LOCALES,).toContain("es",);
    expect(SUPPORTED_LOCALES,).toContain("fr",);
    expect(SUPPORTED_LOCALES.length,).toBeGreaterThan(5,);
  });

  it("has English as default", () => {
    expect(DEFAULT_LOCALE,).toBe("en",);
  });
});
