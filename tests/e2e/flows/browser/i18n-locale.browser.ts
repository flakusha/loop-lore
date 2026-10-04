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
 *  1. The locale selector on /views/settings switches the page's active catalog
 *     to Spanish (`src/frontend/ui.ts:251-254` swaps
 *     `globalThis.__localeStrings` and Alpine re-renders bound nodes), the page
 *     translator resolves a known key to its distinct Spanish string, and
 *     `onLocaleChange()` (src/frontend/alpine/settings/general.ts) then reloads
 *     so the server re-serves views in the new locale.
 *  2. A translation key missing from the active catalog renders the RAW key:
 *     the shipped frontend translator has NO fallback-locale chain
 *     (src/frontend/ui.ts `t` returns the key; src/frontend/alpine/i18n.ts
 *     returns `fallback ?? key`). The fallback chain exists only server-side
 *     (src/middleware/i18n.ts `createI18nContext`); a client-side chain is
 *     noted as desired-but-unbuilt in .plan/tickets/TASK-010.md.
 *
 * @pillar i18n
 */

import type { Page, } from "@playwright/test";
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
/** Marker stamped on the pre-reload document; gone once the reload commits. */
const PRE_RELOAD_STAMP = "__preReloadDoc";

/**
 * Switch the locale select and wait for the reload it triggers.
 *
 * `onLocaleChange()` (src/frontend/alpine/settings/general.ts) persists the
 * choice, then calls `location.reload()` so the server re-serves views in the
 * new locale. The in-place catalog swap happens BEFORE that reload, so a plain
 * `waitForFunction` can match the pre-reload document and hand the next
 * `page.evaluate` a context the reload then destroys. Stamp the current
 * document first, then wait for the stamp to be gone: that is the reload having
 * committed.
 */
async function switchLocale(page: Page, locale: string,): Promise<void> {
  await page.evaluate((stamp: string,) => {
    Reflect.set(globalThis, stamp, true,);
  }, PRE_RELOAD_STAMP,);

  await page.selectOption(LOCALE_SELECT, locale,);
  await page.waitForFunction(
    (stamp: string,) => Reflect.get(globalThis, stamp,) !== true,
    PRE_RELOAD_STAMP,
    { timeout: 30_000, },
  );
}

describe("i18n E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("locale selector switches the active catalog, then reloads the page", async () => {
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

      // Switch to Spanish; the helper waits for the reload onLocaleChange()
      // triggers, so every assertion below runs on the post-reload document
      // instead of racing its teardown.
      await switchLocale(page, "es",);

      // The server re-served this document in the new locale — the cookie the
      // handler set before reloading.
      const reloadedLang = await page.evaluate(
        () => (document.documentElement.lang || ""),
      );

      expect(reloadedLang.startsWith("es",),).toBe(true,);

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
      // onLocaleChange() reloads the page (settings general.ts) so a reload is
      // in flight here; closeAllPages bounds the close instead of hanging on
      // Chromium's withheld close ack.
      await ctx.closeAllPages();
    }
  }, 60_000,);

  test("missing key renders the raw key (no client-side fallback chain)", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await page.goto(ctx.url + SETTINGS_URL_FRAGMENT,);
      await page.waitForSelector(LOCALE_SELECT, { timeout: 30_000, },);

      // Switch to Spanish so the active catalog is the Spanish one.
      await switchLocale(page, "es",);
      // The SHIPPED translator (ui.ts `t`, assigned to globalThis by the layout
      // bundle) resolves the known key in the post-reload document.
      const reloadedEditLabel = await page.evaluate(() => {
        const g = globalThis as unknown as { t?: (key: string,) => string };
        return g.t?.("common.edit",) ?? null;
      },);

      expect(reloadedEditLabel,).toBe(SPANISH_EDIT_LABEL,);

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
      await ctx.closeAllPages();
    }
  }, 60_000,);
});
