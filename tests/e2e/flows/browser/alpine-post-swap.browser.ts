// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Post-swap Alpine hydration + i18n (epic-frontend-components /
 * epic-frontend-internationalization "Post-swap hydration" dependency rows).
 *
 * `src/frontend/alpine/htmx.ts:80-84` re-runs `Alpine.initTree` after every htmx
 * swap — and SWALLOWS its errors (`/* Alpine may fail on partial swaps *`), while
 * `alpine-init.ts:105-115` re-hydrates client dates on `htmx:afterSwap`. Nothing
 * before this suite asserted that the swapped subtree actually became reactive.
 *
 * Test 1 drives a sidebar htmx swap and asserts the swapped view hydrates
 * (every `[x-data]` initialized, no stranded `[x-cloak]`), the afterSwap title
 * sync (`htmx.ts:92-99`) runs, and the ui-store resets to closed-panel defaults.
 *
 * Test 2 switches the locale to Spanish (cookie + reload, per the settings
 * general panel), then htmx-swaps to a non-settings view and asserts the swapped
 * server-rendered fragment carries the Spanish catalog (`notifications.title` =
 * "Notificaciones", distinct from English) — post-swap translation rendering.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { getAlpineStore, navigateViaHtmx, trackPageErrors, } from "../../helpers/htmx-alpine";

const RESOURCE_NOISE = [/Failed to load resource/,];
const LOCALE_SELECT = '[data-testid="locale-select"]';
const PRE_RELOAD_STAMP = "__preReloadDoc";

/**
 * Switch the locale select and wait for the reload it triggers (same stamp
 * technique as i18n-locale.browser.ts: the in-place catalog swap happens before
 * location.reload(), so we wait for the stamp to disappear instead).
 */
async function switchLocale(page: Parameters<typeof trackPageErrors>[0], locale: string,): Promise<void> {
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

/** Assert every live [x-data] element is Alpine-initialized and no x-cloak remains. */
async function assertSwappedSubtreeHydrated(page: Parameters<typeof trackPageErrors>[0],): Promise<void> {
  await page.waitForFunction(
    () => {
      const els = [...document.querySelectorAll("[x-data]",),];
      return els.length > 0 && els.every((el,) => "_x_dataStack" in el);
    },
    { timeout: 15_000, polling: 200, },
  );

  const audit = await page.evaluate(() => ({
    uninitialized: [...document.querySelectorAll("[x-data]",),]
      .filter((el,) => !("_x_dataStack" in el))
      .map((el,) => el.getAttribute("x-data",) ?? "<empty>"),
    strandedXCloak: [...document.querySelectorAll("[x-cloak]",),].length,
  }));

  expect(audit.uninitialized,).toEqual([],);
  expect(audit.strandedXCloak,).toBe(0,);
}

describe("Post-swap Alpine hydration E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("sidebar htmx swap hydrates the new view and runs afterSwap listeners", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: RESOURCE_NOISE, },);
    try {
      await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='message-list']",).waitFor({ state: "attached", timeout: 30_000, },);

      await navigateViaHtmx(page, "nav-characters", "characters-header",);

      // The swapped characters subtree is fully reactive.
      await assertSwappedSubtreeHydrated(page,);

      // htmx:afterSwap title sync (src/frontend/alpine/htmx.ts) reflects the
      // new view's header title.
      await page.waitForFunction(
        () => /Characters/.test(document.title,),
        { timeout: 10_000, polling: 200, },
      );

      // Morph/store reset: no chat-scoped panel survived the navigation.
      const ui = await getAlpineStore<Record<string, unknown>>(page, "ui",);
      expect(ui.showChatList,).toBe(false,);
      expect(ui.showGallery,).toBe(false,);
      expect(ui.showCharacterInfo,).toBe(false,);
      expect(ui.hasActiveChat,).toBe(false,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("swapped fragment renders the Spanish catalog after a locale switch", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: RESOURCE_NOISE, },);
    try {
      // Switch to Spanish on /views/settings (persists the locale cookie and
      // reloads the document so the server re-serves in the new locale).
      await page.goto(`${ctx.url}/views/settings`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.waitForSelector(LOCALE_SELECT, { timeout: 30_000, },);
      await switchLocale(page, "es",);

      // Fresh load of a non-settings view in Spanish.
      await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='message-list']",).waitFor({ state: "attached", timeout: 30_000, },);
      const lang = await page.evaluate(() => document.documentElement.lang);
      expect(lang.startsWith("es",),).toBe(true,);

      // htmx-swap to /views/notifications; the swapped fragment is fetched
      // with the locale cookie, so its server-rendered title must resolve
      // through the Spanish catalog (en: "Notifications" / es: "Notificaciones").
      await navigateViaHtmx(page, "nav-notifications", "notifications-header",);
      const title = await page
        .locator("[data-testid='notifications-header'] .title",)
        .textContent();

      expect(title?.trim(),).toBe("Notificaciones",);

      // The swapped subtree is reactive, not just present.
      await assertSwappedSubtreeHydrated(page,);
    } finally {
      errors.assert();
      errors.detach();
      await ctx.closeAllPages();
    }
  }, 60_000,);
});
