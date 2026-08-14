/**
 * Browser E2E: Settings Flow
 *
 * Verifies settings changes through the /views/settings UI actually PERSIST:
 *  - displayName → PUT /api/users/me → users.display_name
 *  - theme → PATCH /api/users/me/settings → users.settings JSON + localStorage
 *  - keys tab renders the encryption-key management surface
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

describe("Settings flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 45_000,);

  afterAll(async () => {
    await ctx.close();
  },);

  async function gotoSettings(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.goto(`${ctx.url}/views/settings`, { waitUntil: "domcontentloaded", timeout: 15_000, },);
    await page.locator("[data-testid='settings-header']",).waitFor({ state: "attached", timeout: 10_000, },);
    // Wait for settings to load (save button enabled only once loaded).
    await page.locator("[data-testid='save-general']",).waitFor({ state: "visible", timeout: 10_000, },);
    await page.waitForTimeout(500,);
  }

  describe("General settings persist", () => {
    test("saving a new display name persists to the users table", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoSettings(page,);

        const displayName = `Browser-User-${Date.now()}`;
        await page.fill("#displayName", displayName,);
        await page.click("[data-testid='save-general']",);
        await page.waitForTimeout(800,);

        // PUT /api/users/me sets users.display_name for the solo user.
        const row = await ctx.db
          .selectFrom("users",)
          .select(["display_name",],)
          .where("id", "=", SEED.solo.id,)
          .executeTakeFirst();
        expect(row,).not.toBeNull();
        expect(row!.display_name,).toBe(displayName,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 40_000,);

    test("changing theme persists to the settings JSON", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoSettings(page,);

        const theme = "dracula";
        await page.selectOption("[data-testid='theme-select']", theme,);
        // @change calls saveGeneral() automatically.
        await page.waitForTimeout(800,);

        const row = await ctx.db
          .selectFrom("users",)
          .select(["settings",],)
          .where("id", "=", SEED.solo.id,)
          .executeTakeFirst();
        expect(row,).not.toBeNull();
        expect(row!.settings,).toContain(theme,);

        const lsTheme = await page.evaluate(() => localStorage.getItem("theme-preference",));
        expect(lsTheme,).toBe(theme,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 40_000,);
  });

  describe("Settings tabs render", () => {
    test("keys tab renders the encryption key management surface", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoSettings(page,);
        await page.locator(".world-edit-tab",).filter({ hasText: "Keys", },).first().click();
        await page.waitForTimeout(500,);
        await page.locator("[data-testid='settings-keys']",).waitFor({ state: "visible", timeout: 8000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 40_000,);
  });
});
