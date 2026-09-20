// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Settings Flow
 *
 * Verifies settings changes through the /views/settings UI actually PERSIST:
 *  - displayName → PUT /api/users/me → users.display_name
 *  - theme → PATCH /api/users/me/settings → users.settings JSON + localStorage
 *  - keys tab renders the encryption-key management surface
 * @pillar api-keys
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

describe("Settings flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoSettings(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.goto(`${ctx.url}/views/settings`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='settings-header']",).waitFor({ state: "attached", timeout: 30_000, },);
    // Wait for settings to load (save button enabled only once loaded).
    await page.locator("[data-testid='save-general']",).waitFor({ state: "visible", timeout: 30_000, },);
    // sleep: Alpine event binding after form load
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
        // The frontend persists through the versioned API (persistSettings
        // calls /api/v1/users/me); wait for that request, then check the DB.
        const saveRes = page.waitForResponse(
          (res,) => res.url().includes("/api/v1/users/me",) && res.request().method() === "PUT",
          { timeout: 30_000, },
        );
        await page.click("[data-testid='save-general']",);
        await saveRes;

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
    }, 60_000,);

    test("changing theme persists to the settings JSON", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoSettings(page,);

        const theme = "dracula";
        // Wait for the versioned PATCH /api/v1/users/me/settings response.
        const settingsRes = page.waitForResponse(
          (res,) => res.url().includes("/api/v1/users/me/settings",) && res.request().method() === "PATCH",
          { timeout: 30_000, },
        );
        await page.selectOption("[data-testid='theme-select']", theme,);
        await settingsRes;

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
    }, 60_000,);
  });

  describe("Settings tabs render", () => {
    test("keys tab renders the encryption key management surface", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoSettings(page,);
        await page.locator(".world-edit-tab",).filter({ hasText: "Keys", },).first().click();
        // sleep: Alpine x-show transition for tab panel
        await page.waitForTimeout(500,);
        await page.locator("[data-testid='settings-keys']",).waitFor({ state: "visible", timeout: 15_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);
  });

  test("every tab (general/chat/api/notifications/data/keys) renders its panel", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoSettings(page,);
      const tabs: Array<{ label: string; panel: string }> = [
        { label: "General", panel: "settings-general", },
        { label: "Chat", panel: "settings-chat", },
        { label: "API", panel: "settings-api", },
        { label: "Notifications", panel: "settings-notifications", },
        { label: "Data", panel: "settings-data", },
        { label: "Keys", panel: "settings-keys", },
        { label: "Models", panel: "settings-models", },
      ];
      for (const tab of tabs) {
        await page
          .locator(".world-edit-tab",)
          .filter({ hasText: tab.label, },)
          .first()
          .click();
        await page.waitForTimeout(300,);
        await page
          .locator(`[data-testid='${tab.panel}']`,)
          .waitFor({ state: "attached", timeout: 15_000, },);
      }
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 90_000,);

  test("API tab exposes provider and temp-slider; save-api persists temperature", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoSettings(page,);
      await page.locator(".world-edit-tab",).filter({ hasText: "API", },).first().click();
      await page.waitForTimeout(300,);
      await page.locator("[data-testid='settings-api']",).waitFor({ state: "attached", timeout: 15_000, },);
      await page.locator("[data-testid='api-provider']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='temp-slider']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='save-api']",).waitFor({ state: "attached", timeout: 10_000, },);

      await page.locator("[data-testid='temp-slider']",).fill("0.7",);
      await page.locator("[data-testid='save-api']",).click();
      await page.waitForTimeout(500,);

      const row = await ctx.db
        .selectFrom("users",)
        .select(["settings",],)
        .where("id", "=", SEED.solo.id,)
        .executeTakeFirstOrThrow();
      const parsed = JSON.parse(row.settings ?? "{}",) as Record<string, unknown>;
      expect(parsed,).toHaveProperty("temperature",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("Data tab exposes export-all and delete-all buttons", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoSettings(page,);
      await page.locator(".world-edit-tab",).filter({ hasText: "Data", },).first().click();
      await page.waitForTimeout(300,);
      await page.locator("[data-testid='settings-data']",).waitFor({ state: "attached", timeout: 15_000, },);
      await page.locator("[data-testid='export-all']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='delete-all']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("chat-tab autoScroll toggle persists to users.settings", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoSettings(page,);
      await page.locator(".world-edit-tab",).filter({ hasText: "Chat", },).first().click();
      await page.waitForTimeout(300,);
      await page.locator("[data-testid='settings-chat']",).waitFor({ state: "attached", timeout: 15_000, },);

      const toggle = page.locator("#auto-scroll",);
      await toggle.waitFor({ state: "attached", timeout: 10_000, },);
      const before = await toggle.isChecked();
      // The checkbox is visually hidden (.toggle input { display: none })
      // behind a styled slider — click its label, as a user would.
      await page.locator("label.toggle:has(#auto-scroll)",).click();
      await page.waitForTimeout(500,);

      const row = await ctx.db
        .selectFrom("users",)
        .select(["settings",],)
        .where("id", "=", SEED.solo.id,)
        .executeTakeFirstOrThrow();
      const parsed = JSON.parse(row.settings ?? "{}",) as Record<string, unknown>;
      expect(parsed,).toHaveProperty("autoScroll",);
      expect(parsed.autoScroll,).toBe(!before,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
