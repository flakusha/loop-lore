// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Autonomy panel on the world editor's Autonomy tab.
 *
 * The panel's bindings are evaluated by Alpine as soon as the tab renders,
 * so a reference to a name that exists on only one of its hosts throws a
 * page error and takes the rest of the tab's handlers down with it. That
 * failure is invisible to the unit tests and to the server-side gates — it
 * only shows up in a real browser — so the no-page-error assertion here is
 * the point of the test, not an incidental check.
 *
 * Also covers the per-actor override end to end: the picker lists the
 * world's characters, selecting one reveals its editor, and saving writes
 * `autonomy` into that character's `autonomy_preferences`.
 *
 * Runs in default solo mode (auth not required); the solo user owns every
 * world it creates, so the world editor is reachable.
 */

import type { Page, } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";

describe("World autonomy panel E2E", () => {
  let ctx: BrowserTestContext;

  const ALLOW_NOISE = [/favicon/i, /status of 404 \(Not Found\)/, /status of 401 \(Unauthorized\)/,];

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  /**
   * @returns the id of a world created through the worlds-view UI
   */
  async function createWorld(page: Page,): Promise<string> {
    await page.goto(`${ctx.url}/views/worlds`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='create-world']",).waitFor({ state: "attached", timeout: 30_000, },);
    await page.evaluate(() => {
      const el = document.querySelector("[data-testid='create-world']",);
      if (el instanceof HTMLElement) { el.click(); }
    },);
    await page.locator("[data-testid='create-world-form'] #world-name",).waitFor({
      state: "attached",
      timeout: 15_000,
    },);
    await page.fill("[data-testid='create-world-form'] #world-name", `autonomy-${Date.now()}`,);
    await page.evaluate(() => {
      const fn = (globalThis as { createWorld?: (event: Event,) => Promise<void> }).createWorld;
      const form = document.querySelector("[data-testid='create-world-form']",) as HTMLFormElement | null;
      if (fn && form) {
        const event = new Event("submit", { bubbles: true, cancelable: true, },);
        Object.defineProperty(event, "target", { value: form, },);
        Object.defineProperty(event, "currentTarget", { value: form, },);
        void fn(event,);
      }
    },);
    await page.waitForURL((url,) => /\/worlds\/[a-f0-9-]+\/edit$/.test(url.pathname,), { timeout: 30_000, },);
    const match = page.url().match(/\/worlds\/([a-f0-9-]+)\/edit/,);
    if (!match) { throw new Error(`Could not parse world id from URL: ${page.url()}`,); }
    return match[1]!;
  }

  /**
   * Add a character to a world. A world has no members on creation, so
   * without this the picker is empty and the per-actor bindings are never
   * evaluated at all.
   *
   * @param worldId the world to add the character to
   * @param displayName the character's name, as the picker should show it
   * @returns the new character's actor id
   */
  async function addCharacter(worldId: string, displayName: string,): Promise<string> {
    const actorId = crypto.randomUUID();
    await ctx.db
      .insertInto("actors",)
      .values({ id: actorId, actor_type: "character", agent_type: "npc", display_name: displayName, },)
      .execute();
    await ctx.db.insertInto("world_members",).values({ world_id: worldId, actor_id: actorId, },).execute();
    return actorId;
  }

  /**
   * Open the Autonomy tab. The switch goes through a DOM click so the
   * notification-bell overlay cannot block the actionability check.
   *
   * @param page a page already on the world editor
   */
  async function openAutonomyTab(page: Page,): Promise<void> {
    await page.locator("[data-testid='tab-autonomy']",).waitFor({ state: "attached", timeout: 30_000, },);
    await page.evaluate(() => {
      const el = document.querySelector("[data-testid='tab-autonomy']",);
      if (el instanceof HTMLElement) { el.click(); }
    },);
    await page.locator("[data-testid='autonomy-panel']",).waitFor({ state: "visible", timeout: 30_000, },);
    // The panel GETs on init; the body renders once that data lands.
    await page.locator("[data-testid='autonomy-body']",).waitFor({ state: "visible", timeout: 30_000, },);
  }

  describe("the Autonomy tab", () => {
    test("renders its bindings without throwing, and lists the world's characters", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, { allowlist: ALLOW_NOISE, },);
      try {
        const worldId = await createWorld(page,);
        await addCharacter(worldId, "Zara",);

        await page.reload({ waitUntil: "domcontentloaded", },);
        await openAutonomyTab(page,);

        // The regression this file exists for: a binding naming a value
        // absent from this mount's factory scope.
        expect(errors.errors,).toEqual([],);

        const options = await page.$$eval(
          "[data-testid='autonomy-actor-picker'] option",
          (els,) => els.map((el,) => (el as HTMLOptionElement).textContent?.trim()),
        );
        expect(options,).toContain("Zara",);
      } finally {
        errors.assert();
        await page.close();
      }
    }, 120_000,);

    test("a per-character override saves to that character's traits", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, { allowlist: ALLOW_NOISE, },);
      try {
        const worldId = await createWorld(page,);
        const actorId = await addCharacter(worldId, "Bryn",);

        await page.reload({ waitUntil: "domcontentloaded", },);
        await openAutonomyTab(page,);

        // Nothing selected yet, so the editor stays collapsed.
        expect(await page.locator("[data-testid='autonomy-actor-save']",).count(),).toBe(0,);

        await page.selectOption("[data-testid='autonomy-actor-picker']", actorId,);
        await page.locator("[data-testid='autonomy-actor-save']",).waitFor({ state: "visible", timeout: 15_000, },);

        // Pick a preset, then save. Save stays disabled until the draft
        // differs from what the character already stores.
        await page.evaluate(() => {
          const panel = document.querySelector("[data-testid='autonomy-actor-editor']",);
          const select = panel?.querySelector("select:not([data-testid='autonomy-actor-picker'])",);
          if (select instanceof HTMLSelectElement) {
            select.value = "serene";
            select.dispatchEvent(new Event("change", { bubbles: true, },),);
          }
        },);
        await page.locator("[data-testid='autonomy-actor-save']",).click();

        // Written by the panel's PUT, not by the page reload above.
        const deadline = Date.now() + 15_000;
        let stored: string | null = null;
        while (Date.now() < deadline && stored === null) {
          const row = await ctx.db
            .selectFrom("character_internal_traits",)
            .select("autonomy_preferences",)
            .where("actor_id", "=", actorId,)
            .executeTakeFirst();
          const prefs = row?.autonomy_preferences;
          if (typeof prefs === "string" && prefs.includes("serene",)) { stored = prefs; }
        }
        expect(stored,).toContain("serene",);
        expect(errors.errors,).toEqual([],);
      } finally {
        errors.assert();
        await page.close();
      }
    }, 120_000,);
  });
});
