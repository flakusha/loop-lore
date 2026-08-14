/**
 * Browser E2E: Creation Flows
 *
 * Verifies creation actions through the UI actually PERSIST to the database
 * (the existing suites only assert modal presence/attached DOM, never the
 * persisted result). Covers:
 *  - Character create via /views/characters
 *  - World create via /views/worlds (asserts the app's redirect to world-edit)
 *  - World-edit location add via /worlds/:id/edit
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";

describe("Creation flows E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 45_000,);

  afterAll(async () => {
    await ctx.close();
  },);

  async function gotoView(
    page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
    path: string,
  ) {
    await page.goto(`${ctx.url}${path}`, { waitUntil: "domcontentloaded", timeout: 15_000, },);
    await page.locator("[data-testid='app-root']",).waitFor({ state: "attached", timeout: 10_000, },);
  }

  describe("Character create persists", () => {
    test("creates a character that appears in the grid and DB", async () => {
      const page = await ctx.openPage();
      try {
        await gotoView(page, "/views/characters",);
        await page.locator("[data-testid='create-character']",).waitFor({ state: "visible", timeout: 8000, },);
        await page.click("[data-testid='create-character']",);
        await page.locator("[data-testid='create-character-form']",).waitFor({ state: "visible", timeout: 8000, },);

        const name = `Browser-Created-${Date.now()}`;
        await page.fill("#char-name", name,);
        await page.fill("#char-desc", "Created via browser e2e",);
        await page.click("[data-testid='create-character-form'] button[type='submit']",);

        // Persisted in DB (solo user context).
        const row = await ctx.db
          .selectFrom("actors",)
          .select(["id", "display_name",],)
          .where("display_name", "=", name,)
          .executeTakeFirst();
        expect(row,).not.toBeNull();
        expect(row!.display_name,).toBe(name,);

        // The grid reload can race the DB commit, so reload the page (grid
        // re-fetches on load) and assert the new card renders.
        await page.reload({ waitUntil: "domcontentloaded", },);
        await page.locator(`[data-testid='character-card-${row!.id}']`,).waitFor({ timeout: 10_000, },);
      } finally {
        await page.close();
      }
    }, 40_000,);
  });

  describe("World create persists", () => {
    test("creates a world in DB and redirects to its edit page", async () => {
      const page = await ctx.openPage();
      try {
        await gotoView(page, "/views/worlds",);
        await page.locator("[data-testid='create-world']",).waitFor({ state: "visible", timeout: 8000, },);
        await page.click("[data-testid='create-world']",);
        await page.locator("[data-testid='create-world-form']",).waitFor({ state: "visible", timeout: 8000, },);

        const name = `Browser-World-${Date.now()}`;
        await page.fill("#world-name", name,);
        await page.fill("#world-description", "Created via browser e2e",);
        await page.click("[data-testid='create-world-form'] button[type='submit']",);

        // Persisted in DB.
        const row = await ctx.db
          .selectFrom("worlds",)
          .select(["id", "name",],)
          .where("name", "=", name,)
          .executeTakeFirst();
        expect(row,).not.toBeNull();
        expect(row!.name,).toBe(name,);

        // App UX: createWorld() redirects to the new world's edit page.
        await page.waitForURL((url,) => url.pathname === `/worlds/${row!.id}/edit`, { timeout: 10_000, },);
      } finally {
        await page.close();
      }
    }, 40_000,);
  });

  describe("World-edit location add persists", () => {
    test("adds a location to a created world that persists to DB", async () => {
      const page = await ctx.openPage();
      try {
        // Create a world owned by the solo user via the UI modal (the app
        // redirects to its edit page on success where we add the location).
        await gotoView(page, "/views/worlds",);
        await page.locator("[data-testid='create-world']",).waitFor({ state: "visible", timeout: 8000, },);
        await page.click("[data-testid='create-world']",);
        await page.locator("[data-testid='create-world-form']",).waitFor({ state: "visible", timeout: 8000, },);
        const worldName = `LocWorld-${Date.now()}`;
        await page.fill("#world-name", worldName,);
        await page.click("[data-testid='create-world-form'] button[type='submit']",);
        const worldRow = await ctx.db
          .selectFrom("worlds",)
          .select(["id", "owner_id",],)
          .where("name", "=", worldName,)
          .executeTakeFirst();
        expect(worldRow,).not.toBeNull();

        // Navigate to its edit page and wait for the world to load (tab bar).
        await page.goto(`${ctx.url}/worlds/${worldRow!.id}/edit`, { waitUntil: "domcontentloaded", timeout: 15_000, },);
        await page.locator(".world-edit-tabs",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.waitForTimeout(500,);

        // Switch to the Locations tab.
        await page.locator(".world-edit-tab",).filter({ hasText: "Locations", },).first().click();
        await page.waitForTimeout(500,);

        // Reveal the add-location form (its toggle sets showAddForm = true).
        // The toggle is the header button with text "Add location".
        await page.evaluate(() => {
          const toggle = [...document.querySelectorAll("button",),].find((b,) =>
            b.textContent?.trim()?.toLowerCase().includes("add location",)
          );
          (toggle as HTMLElement | undefined)?.click();
        },);
        await page.locator("#loc-name",).waitFor({ state: "visible", timeout: 8000, },);

        const locName = `Browser-Loc-${Date.now()}`;
        await page.fill("#loc-name", locName,);
        await page.waitForTimeout(200,);
        await page.evaluate(() => {
          const addBtn = [...document.querySelectorAll(".add-location-form button",),].find((b,) =>
            b.textContent?.trim()?.toLowerCase() === "add"
          );
          (addBtn as HTMLElement | undefined)?.click();
        },);

        const row = await ctx.db
          .selectFrom("locations",)
          .select(["id", "name", "world_id",],)
          .where("name", "=", locName,)
          .executeTakeFirst();
        expect(row,).not.toBeNull();
        expect(row!.name,).toBe(locName,);
        expect(row!.world_id,).toBe(worldRow!.id,);

        // Rendered in the locations list (.location-name).
        await page.locator(".location-name",).filter({ hasText: locName, },).waitFor({ timeout: 10_000, },);
      } finally {
        await page.close();
      }
    }, 60_000,);
  });
});
