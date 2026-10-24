// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { EXPECTED_404_NOISE_ALLOWLIST, trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

describe("Characters flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    // The detail modal fetches /api/v1/actors/:id/mood, which the API answers
    // with a designed 404 for characters that never had mood state created —
    // surfacing as a console error and failing the no-page-errors contract.
    // Characters gain a mood row in production once chatted with; mirror that
    // realistic state here.
    const now = new Date().toISOString();
    await ctx.db
      .insertInto("character_mood",)
      .values({
        id: "b2000000-0000-4000-a000-000000000000",
        actor_id: SEED.soloCharacter.id,
        last_mood_change: now,
        created_at: now,
        updated_at: now,
      },)
      .onConflict((oc,) => oc.column("id",).doNothing())
      .execute();

    // The character edit view's licensing panel fetches
    // /api/v1/actors/:id/licensing, whose designed 404 ("no license yet") still
    // logs a browser console resource error. Characters configured for
    // publishing carry a license row; mirror that realistic state here.
    const licNow = new Date().toISOString();
    await ctx.db
      .insertInto("character_licensing",)
      .values({
        id: "b3000000-0000-4000-a000-000000000000",
        actor_id: SEED.soloCharacter.id,
        license_type: "cc0",
        created_at: licNow,
        updated_at: licNow,
      },)
      .onConflict((oc,) => oc.column("id",).doNothing())
      .execute();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoCharacters(
    page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
  ) {
    try {
      await page.goto(`${ctx.url}/views/characters`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    } catch {}

    await page.locator("[data-testid='app-root']",).waitFor({ state: "attached", timeout: 15_000, },);
  }

  describe("Page load", () => {
    test("characters page loads with header", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoCharacters(page,);
        await page.locator("[data-testid='characters-header']",).waitFor({ state: "attached", timeout: 10_000, },);
        expect(page.url(),).toContain("/views/characters",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("create and import buttons exist", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoCharacters(page,);
        await page.locator("[data-testid='create-character']",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.locator("[data-testid='import-character']",).waitFor({ state: "visible", timeout: 10_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("characters grid, loading, or empty state present", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoCharacters(page,);
        // Behavioral: the loading state must RESOLVE to a rendered grid or
        // empty state — an OR-locator passes even when grid render is broken
        // (falls through to loading forever).
        await page.waitForSelector("[data-testid='characters-loading']", {
          state: "detached",
          timeout: 15_000,
        },);

        const resolved = await page
          .locator("[data-testid='character-grid'], [data-testid='characters-empty']",)
          .count();

        expect(resolved,).toBeGreaterThan(0,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  describe("Create character", () => {
    test("create character modal opens", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoCharacters(page,);
        await page.locator("[data-testid='create-character']",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.click("[data-testid='create-character']",);
        await page.locator("[data-testid='create-character-modal']",).waitFor({ state: "visible", timeout: 10_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  describe("Import character", () => {
    test("import character modal opens", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoCharacters(page,);
        await page.locator("[data-testid='import-character']",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.click("[data-testid='import-character']",);
        await page.locator("[data-testid='import-character-modal']",).waitFor({ state: "visible", timeout: 10_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  describe("Character detail", () => {
    test("clicking a character opens detail modal", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoCharacters(page,);
        // Wait for grid (characters are seeded so grid should render)
        await page.locator("[data-testid='character-grid']",).waitFor({ state: "attached", timeout: 15_000, },);
        // Click the seeded character's card (targeting it explicitly keeps
        // this test independent of grid ordering if more characters appear).
        const soloCard = page.locator(`[data-testid='character-card-${SEED.soloCharacter.id}']`,);
        await soloCard.waitFor({ state: "visible", timeout: 10_000, },);
        await soloCard.click();

        // Wait for detail modal to become visible — this is the real assertion.
        // Replace raw waitForTimeout with web-first polling.
        await page.locator("[data-testid='character-detail-modal']",).waitFor({ state: "visible", timeout: 15_000, },);

        // Detail modal has action buttons
        await page.locator("[data-testid='start-chat-btn']",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.locator("[data-testid='edit-character-btn']",).waitFor({ state: "visible", timeout: 10_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 30_000,);

    test("start chat button in detail modal redirects to chat", async () => {
      const page = await ctx.openPage();
      // The chat view fetches /api/v1/chats/:id/game-state, which 404s by
      // design until the chat has an extracted state (the client handles it).
      // Allow that expected noise — a bare trackPageErrors tripped on it
      // intermittently when the canvas fetch lost the race against teardown.
      const errors = trackPageErrors(page, { allowlist: EXPECTED_404_NOISE_ALLOWLIST, },);
      try {
        await gotoCharacters(page,);
        await page.locator("[data-testid='character-grid']",).waitFor({ state: "attached", timeout: 15_000, },);
        await page.locator(`[data-testid='character-card-${SEED.soloCharacter.id}']`,).click();
        await page.locator("[data-testid='character-detail-modal']",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.locator("[data-testid='start-chat-btn']",).click();
        // Should redirect to chat page
        await page.locator("[data-testid='chat-header']",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(page.url(),).toContain("/views/chat",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 30_000,);
  });

  describe("Navigation from characters", () => {
    test("sidebar navigation works from characters page", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoCharacters(page,);
        await page.locator("[data-testid='hamburger']",).click();
        await page.locator("[data-testid='nav-gallery']",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.evaluate(() => {
          (document.querySelector("[data-testid='nav-gallery']",) as HTMLElement)?.click();
        },);

        await page.locator("[data-testid='gallery-header']",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(page.url(),).toContain("/views/gallery",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 30_000,);
  });
});
