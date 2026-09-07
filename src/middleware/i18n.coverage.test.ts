// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * i18n middleware coverage — Accept-Language parsing (q-values, invalid
 * entries, empty input) and locale detection priority (cookie first,
 * then header, then default), including damaged headers.
 */
import { describe, expect, test, } from "bun:test";
import { DEFAULT_I18N_CONFIG, } from "../i18n/types.js";
import type { I18nConfig, } from "../i18n/types.js";
import { createI18nContext, detectLocale, parseAcceptLanguage, } from "./i18n.js";

/**
 * @param headers
 */
function req(headers: Record<string, string>,): Request {
  return new Request("http://localhost/", { headers, },);
}

describe("parseAcceptLanguage", () => {
  test("orders by q-value, highest first", () => {
    expect(parseAcceptLanguage("en-US;q=0.8, ja, fr;q=0.9",),).toEqual(["ja", "fr", "en-US",],);
  });

  test("bare languages default to q=1", () => {
    expect(parseAcceptLanguage("ja",),).toEqual(["ja",],);
  });

  test("q=0 entries are excluded per RFC 7231", () => {
    expect(parseAcceptLanguage("en;q=0, ja",),).toEqual(["ja",],);
  });

  test("invalid q-values fall back to 1", () => {
    expect(parseAcceptLanguage("en;q=bogus",),).toEqual(["en",],);
  });

  test("q-values clamp into [0, 1]", () => {
    expect(parseAcceptLanguage("en;q=5",),).toEqual(["en",],);
  });

  test("empty segments are skipped", () => {
    expect(parseAcceptLanguage("ja,, ,en",),).toEqual(["ja", "en",],);
  });

  test("empty header yields no preferences", () => {
    expect(parseAcceptLanguage("",),).toEqual([],);
  });
});

describe("detectLocale", () => {
  test("cookie wins over the header", () => {
    const r = req({ Cookie: "ll_locale=ja", "Accept-Language": "fr", },);
    expect(detectLocale(r,),).toBe("ja",);
  });

  test("falls back to Accept-Language without a cookie", () => {
    const r = req({ "Accept-Language": "fr-CA, fr;q=0.9", },);
    expect(detectLocale(r,),).toBe("fr",);
  });

  test("falls back to the default without any hints", () => {
    expect(detectLocale(req({},),),).toBe(DEFAULT_I18N_CONFIG.defaultLocale,);
  });

  test("ignores unsupported cookie locales and uses the header", () => {
    const r = req({ Cookie: "ll_locale=xx", "Accept-Language": "de", },);
    expect(detectLocale(r,),).toBe("de",);
  });

  test("ignores unsupported header locales and uses the default", () => {
    const r = req({ "Accept-Language": "xx-YY", },);
    expect(detectLocale(r,),).toBe(DEFAULT_I18N_CONFIG.defaultLocale,);
  });

  test("damaged cookie headers do not throw", () => {
    expect(detectLocale(req({ Cookie: ";;;=", },),),).toBe(DEFAULT_I18N_CONFIG.defaultLocale,);
    expect(detectLocale(req({ Cookie: "ll_locale=", },),),).toBe(DEFAULT_I18N_CONFIG.defaultLocale,);
  });

  test("custom supported locales are honored", () => {
    const config: I18nConfig = {
      ...DEFAULT_I18N_CONFIG,
      defaultLocale: "en",
      supportedLocales: ["en", "ja",],
    };
    // "pt" is a real locale but not in this config's supported list.
    expect(detectLocale(req({ "Accept-Language": "pt", },), config,),).toBe("en",);
    expect(detectLocale(req({ "Accept-Language": "ja", },), config,),).toBe("ja",);
  });
});

describe("createI18nContext", () => {
  test("builds a translator for the detected locale", () => {
    const ctx = createI18nContext("ja",);
    expect(ctx.locale,).toBe("ja",);
    expect(typeof ctx.t,).toBe("function",);
  });

  test("falls back for the default locale", () => {
    const ctx = createI18nContext(DEFAULT_I18N_CONFIG.defaultLocale,);
    expect(ctx.locale,).toBe(DEFAULT_I18N_CONFIG.defaultLocale,);
  });
});
