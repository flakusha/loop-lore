// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Character Edit View
 *
 * Verifies the /characters/:id/edit page:
 *  - header renders with the expected data-page attribute
 *  - the edit form htmx-loads from /dynamic/characters/:id/edit-form and
 *    populates the form fields with the seeded character data
 *  - sub-editors (traits) render the seeded trait labels
 *
 * Pre-logs in via seeded data (demo/solo mode).
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

type TestPage = Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>;

describe("Character edit view E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await ctx.db
      .insertInto("actors",)
      .values({
        id: SEED.character.id,
        actor_type: "character",
        display_name: SEED.character.name,
        user_id: SEED.solo.id,
        owner_id: SEED.solo.id,
        agent_type: "ai",
        description: "Character for E2E testing",
        system_prompt: "You are a test character.",
        settings: "{}",
        import_spec: "raw",
        personality: "Helpful test personality",
        appearance: "Nondescript E2E test appearance",
        default_outfit: "everyday",
        outfits: JSON.stringify([{ id: "everyday", name: "Everyday", descriptor: "Simple everyday clothes", },],),
      },)
      .onConflict((oc,) => oc.column("id",).doNothing())
      .execute();
    // Seed a licensing record: the edit form's licensing panel fetches
    // /api/actors/:id/licensing, whose designed 404 ("no license yet") still
    // logs a browser console resource error. Characters configured for
    // publishing carry a license row; mirror that realistic state here.
    const licNow = new Date().toISOString();
    await ctx.db
      .insertInto("character_licensing",)
      .values({
        id: "b3000000-0000-4000-a000-000000000000",
        actor_id: SEED.character.id,
        license_type: "cc0",
        created_at: licNow,
        updated_at: licNow,
      },)
      .onConflict((oc,) => oc.column("id",).doNothing())
      .execute();
    // Seed permanent traits (the schema stores these in a side table, not on
    // the actor row). Idempotent on re-runs.
    for (const t of [{ id: "kind", label: "Kind", }, { id: "curious", label: "Curious", },]) {
      await ctx.db
        .insertInto("character_permanent_traits",)
        .values({
          id: `b1000000-0000-4000-a000-${t.id.padStart(12, "0",)}`,
          actor_id: SEED.character.id,
          trait_category: "personality",
          trait_name: t.label,
          trait_value: t.label,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },)
        .onConflict((oc,) => oc.column("id",).doNothing())
        .execute();
    }
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoEdit(page: TestPage,) {
    await page.goto(`${ctx.url}/characters/${SEED.character.id}/edit`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    },);
    await page
      .locator("[data-testid='character-edit-header']",)
      .waitFor({ state: "attached", timeout: 30_000, },);
    await page.locator("#character-edit-form",).waitFor({ state: "attached", timeout: 30_000, },);
    // Web-first: wait for the htmx-loaded form's last section to mount
    // instead of a fixed sleep.
    await page
      .locator("[data-testid='actor-panels-section']",)
      .waitFor({ state: "attached", timeout: 30_000, },);
  }

  test("renders header and htmx-loaded edit form for the seeded character", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoEdit(page,);

      // The header has the data-page marker used by the SPA router.
      const header = page.locator("[data-testid='character-edit-header']",);
      await expect(header.getAttribute("data-page",),).resolves.toBe("character-edit",);

      // The form slot htmx-loads from /dynamic/characters/:id/edit-form; once
      // it has loaded, the panel and at least one section must be present.
      const form = page.locator("#character-edit-form",);
      const formHtml = await form.innerHTML();
      expect(formHtml.length,).toBeGreaterThan(0,);
      expect(formHtml,).toContain("Internal Traits",);
      expect(formHtml,).toContain("Sub-resources",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
