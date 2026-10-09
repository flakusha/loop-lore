// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Alpine hydration smoke (BUG-alpine-hydration-failures-undeclared-template-vars-untested)
 *
 * The 2026-08 hydration incident (`epic-testing-qa.md:83-114`): undeclared template
 * variables (`showGmPanel`/`_moodPanel`/`_searchResults`) threw during Alpine tree
 * processing, Alpine aborted the subtree, and every browser suite stayed green.
 *
 * This suite is the generic guard: for every reachable view it asserts, after Alpine
 * settles —
 *   1. every in-DOM `[x-data]` element was initialized (`_x_dataStack` present),
 *   2. no `[x-cloak]` attribute survives (Alpine strips it while processing an element;
 *      a subtree that failed to process keeps it),
 *   3. no uncaught page errors / console.error other than resource-load noise.
 *
 * Only resource-load console messages (`Failed to load resource …`) are allowlisted:
 * hydration failures are JS exceptions, which still fail the suite.
 *
 * Excluded views (need ids/roles, covered by their own suites): /views/admin,
 * /views/nsfw-moderation, /views/world-detail, /views/world-edit, /views/character-edit.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";

/** Resource-load console noise (favicon/asset 4xx etc.) is not a hydration failure. */
const RESOURCE_NOISE = [/Failed to load resource/,];

/**
 * Every view reachable in the default harness with the selector that proves the
 * view rendered. Headers carry `data-testid="<view>-header"` (or the view's own
 * primary landmark for login/register/new-chat/chat).
 */
const VIEWS: Array<{ path: string; ready: string; hasAlpine: boolean }> = [
  { path: "/views/chat", ready: "[data-testid='message-list']", hasAlpine: true, },
  { path: "/views/characters", ready: "[data-testid='characters-header']", hasAlpine: true, },
  { path: "/views/gallery", ready: "[data-testid='gallery-header']", hasAlpine: true, },
  { path: "/views/settings", ready: "[data-testid='settings-header']", hasAlpine: true, },
  { path: "/views/worlds", ready: "[data-testid='worlds-header']", hasAlpine: true, },
  { path: "/views/new-chat", ready: "[data-testid='create-chat-form']", hasAlpine: false, },
  { path: "/views/chat-list", ready: "header[data-page='chat-list']", hasAlpine: false, },
  { path: "/views/personas", ready: "[data-testid='personas-header']", hasAlpine: true, },
  { path: "/views/quests", ready: "[data-testid='quests-header']", hasAlpine: true, },
  { path: "/views/notifications", ready: "[data-testid='notifications-header']", hasAlpine: true, },
  { path: "/views/blog", ready: "[data-testid='blog-header']", hasAlpine: true, },
  { path: "/views/config", ready: "[data-testid='config-header']", hasAlpine: true, },
  { path: "/views/login", ready: "[data-testid='login-submit']", hasAlpine: false, },
  { path: "/views/register", ready: "[data-testid='register-submit']", hasAlpine: false, },
];

describe("Alpine hydration smoke E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  for (const view of VIEWS) {
    test(`hydrates without Alpine failures: ${view.path}`, async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, { allowlist: RESOURCE_NOISE, },);
      try {
        await page.goto(`${ctx.url}${view.path}`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
        await page.locator(view.ready,).first().waitFor({ state: "attached", timeout: 30_000, },);

        if (view.hasAlpine) {
          // Web-first: wait until every live [x-data] element carries Alpine's
          // init marker. Replaces any fixed settle sleep.
          await page.waitForFunction(
            () => {
              const els = [...document.querySelectorAll("[x-data]",),];
              return els.length > 0 && els.every((el,) => "_x_dataStack" in el);
            },
            { timeout: 15_000, polling: 200, },
          );
        }

        const audit = await page.evaluate(() => ({
          uninitialized: [...document.querySelectorAll("[x-data]",),]
            .filter((el,) => !("_x_dataStack" in el))
            .map((el,) => el.getAttribute("x-data",) ?? "<empty>"),
          // Alpine removes x-cloak while processing an element; a surviving
          // x-cloak means that subtree never finished hydrating.
          strandedXCloak: [...document.querySelectorAll("[x-cloak]",),].length,
          xDataCount: document.querySelectorAll("[x-data]",).length,
        }));

        expect(audit.uninitialized,).toEqual([],);
        expect(audit.strandedXCloak,).toBe(0,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);
  }
});
