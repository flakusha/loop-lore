// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: i18n locale switching + missing-key behavior
 *
 * Covers TASK-010 acceptance criteria except the plural rule (Intl.PluralRules
 * infra is not present in src/i18n/translator.ts; tracked as the deferred
 * sub-ticket TASK-010-plurals).
 *
 * What we verify here:
 *  1. The locale selector on /views/settings updates visible strings on the
 *     page WITHOUT a full reload (`src/frontend/ui.ts:251-254` swaps
 *     `globalThis.__localeStrings` and Alpine re-renders bound nodes), and
 *     the page translator resolves a known key to its distinct Spanish
 *     string.
 *  2. A translation key missing from the active catalog renders the RAW key:
 *     the shipped frontend translator has NO fallback-locale chain
 *     (src/frontend/ui.ts `t` returns the key; src/frontend/alpine/i18n.ts
 *     returns `fallback ?? key`). The fallback chain exists only server-side
 *     (src/middleware/i18n.ts `createI18nContext`); a client-side chain is
 *     noted as desired-but-unbuilt in .plan/tickets/TASK-010.md.
 *
 * @pillar i18n
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";

const SETTINGS_URL_FRAGMENT = "/views/settings";
const LOCALE_SELECT = '[data-testid="locale-select"]';

/** src/public/locales/en.json → common.edit */
const ENGLISH_EDIT_LABEL = "Edit";
/** src/public/locales/es.json → common.edit — distinct from the English string */
const SPANISH_EDIT_LABEL = "Editar";
/** A key that exists in no locale catalog — probes the missing-key path. */
const MISSING_KEY = "test.nonexistent.key";

describe("i18n E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("locale selector switches active language without page reload", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await page.goto(ctx.url + SETTINGS_URL_FRAGMENT,);
      await page.waitForSelector(LOCALE_SELECT, { timeout: 30_000, },);

      // Active language starts at English (server default).
      const initialLang = await page.evaluate(
        () => (document.documentElement.lang || ""),
      );
      expect(initialLang.startsWith("en",),).toBe(true,);

      // The shipped translator resolves the known key to its English string
      // before the switch — the baseline the Spanish assertion contrasts with.
      const initialEditLabel = await page.evaluate(() => {
        const g = globalThis as unknown as { t?: (key: string,) => string };
        return g.t?.("common.edit",) ?? null;
      },);
      expect(initialEditLabel,).toBe(ENGLISH_EDIT_LABEL,);

      // Capture the navigation entry count BEFORE switching locale — proves we
      // didn't trigger a full page reload (Playwright navigations add to this
      // list; in-place locale swaps do not).
      const navCountBefore = await page.evaluate(
        () => performance.getEntriesByType("navigation",).length,
      );

      await page.selectOption(LOCALE_SELECT, "es",);
      // Wait for the SHIPPED translator (ui.ts `t`, assigned to globalThis by
      // the layout bundle) to resolve `common.edit` to the Spanish string.
      // `saveLocale` flips <html lang> synchronously BEFORE the async catalog
      // fetch lands, so lang alone proves nothing about the swap.
      await page.waitForFunction(
        (expected: string,) => {
          const g = globalThis as unknown as { t?: (key: string,) => string };
          return (g.t?.("common.edit",) ?? null) === expected;
        },
        SPANISH_EDIT_LABEL,
        { timeout: 10_000, },
      );

      const navCountAfter = await page.evaluate(
        () => performance.getEntriesByType("navigation",).length,
      );
      expect(navCountAfter,).toBe(navCountBefore,);

      // English strings are pre-injected at layout render time
      // (src/routes/views/layout.ts wrapWithLayout), so a non-empty catalog
      // would prove nothing about the switch — assert the DISTINCT Spanish
      // value instead.
      const editLabel = await page.evaluate(() => {
        const g = globalThis as unknown as { t?: (key: string,) => string };
        return g.t?.("common.edit",) ?? null;
      },);
      expect(editLabel,).toBe(SPANISH_EDIT_LABEL,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("missing key renders the raw key (no client-side fallback chain)", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await page.goto(ctx.url + SETTINGS_URL_FRAGMENT,);
      await page.waitForSelector(LOCALE_SELECT, { timeout: 30_000, },);

      // Switch to Spanish so the active catalog is the Spanish one.
      await page.selectOption(LOCALE_SELECT, "es",);
      await page.waitForFunction(
        (expected: string,) => {
          const g = globalThis as unknown as { t?: (key: string,) => string };
          return (g.t?.("common.edit",) ?? null) === expected;
        },
        SPANISH_EDIT_LABEL,
        { timeout: 10_000, },
      );

      // Drive the REAL entry point — the ui.ts `t` the page's inline handlers
      // and Alpine bindings resolve through. No in-test reimplementation of
      // flatten/resolve/interpolate.
      const resolved = await page.evaluate((missingKey: string,) => {
        const g = globalThis as unknown as { t?: (key: string,) => string };
        return {
          known: g.t?.("common.edit",) ?? null,
          missing: g.t?.(missingKey,) ?? null,
        };
      }, MISSING_KEY,);

      // A key present in the catalog resolves to its Spanish string.
      expect(resolved.known,).toBe(SPANISH_EDIT_LABEL,);
      // A key absent from the catalog renders the RAW key — the shipped
      // frontend has no fallback-locale chain (src/frontend/ui.ts `t` returns
      // the key; src/frontend/alpine/i18n.ts returns `fallback ?? key`). The
      // fallback chain exists only server-side
      // (src/middleware/i18n.ts createI18nContext).
      expect(resolved.missing,).toBe(MISSING_KEY,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
