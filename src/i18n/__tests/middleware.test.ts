/**
 * i18n Middleware Tests
 */

import { describe, expect, it, } from "bun:test";
import { createI18nContext, detectLocale, parseAcceptLanguage, } from "../../middleware/i18n";
import { DEFAULT_I18N_CONFIG, } from "../types";

describe("parseAcceptLanguage", () => {
  it("parses simple locale", () => {
    expect(parseAcceptLanguage("en",),).toEqual(["en",],);
  });

  it("parses multiple locales with q-values", () => {
    const result = parseAcceptLanguage("ja,en-US;q=0.9,en;q=0.8",);
    expect(result,).toEqual(["ja", "en-US", "en",],);
  });

  it("handles empty string", () => {
    expect(parseAcceptLanguage("",),).toEqual([],);
  });

  it("trims whitespace", () => {
    const result = parseAcceptLanguage("ja , en-US ; q=0.9",);
    expect(result,).toEqual(["ja", "en-US",],);
  });

  it("excludes quality value of 0 (not acceptable per RFC 7231)", () => {
    // q=0 means "not acceptable" — ja must be excluded; en-US selected
    // even though it appears later in the header.
    const result = parseAcceptLanguage("ja;q=0, en-US;q=1",);
    expect(result,).toEqual(["en-US",],);
  });
});

describe("detectLocale", () => {
  it("detects locale from cookie", () => {
    const request = new Request("http://localhost", {
      headers: { "Cookie": "ll_locale=ja; other=value", },
    },);
    expect(detectLocale(request,),).toBe("ja",);
  });

  it("detects locale from Accept-Language header", () => {
    const request = new Request("http://localhost", {
      headers: { "Accept-Language": "ja,en-US;q=0.9", },
    },);
    expect(detectLocale(request,),).toBe("ja",);
  });

  it("falls back to default when no match", () => {
    const request = new Request("http://localhost", {
      headers: { "Accept-Language": "xx", },
    },);
    expect(detectLocale(request,),).toBe("en",);
  });

  it("uses cookie over Accept-Language", () => {
    const request = new Request("http://localhost", {
      headers: {
        "Cookie": "ll_locale=de",
        "Accept-Language": "ja",
      },
    },);
    expect(detectLocale(request,),).toBe("de",);
  });

  it("returns default when no headers", () => {
    const request = new Request("http://localhost",);
    expect(detectLocale(request,),).toBe("en",);
  });

  it("respects custom config", () => {
    const config = {
      ...DEFAULT_I18N_CONFIG,
      defaultLocale: "ja" as const,
    };
    const request = new Request("http://localhost",);
    expect(detectLocale(request, config,),).toBe("ja",);
  });
});

describe("createI18nContext", () => {
  it("creates context with locale and translator", () => {
    const ctx = createI18nContext("en",);
    expect(ctx.locale,).toBe("en",);
    expect(typeof ctx.t,).toBe("function",);
  });

  it("translates keys", () => {
    const ctx = createI18nContext("en",);
    expect(ctx.t("common.save",),).toBe("Save",);
  });

  it("falls back to key for missing translations", () => {
    const ctx = createI18nContext("en",);
    expect(ctx.t("missing.key",),).toBe("missing.key",);
  });
});
