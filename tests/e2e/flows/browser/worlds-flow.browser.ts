// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { createClient, } from "../../helpers/client";
import { seedAll, } from "../../helpers/seed";

describe("Worlds flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await seedAll(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoWorlds(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    try {
      await page.goto(`${ctx.url}/views/worlds`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    } catch {}
    await page.locator("[data-testid='app-root']",).waitFor({ state: "attached", timeout: 15_000, },);
  }

  async function createWorldViaApi(name: string,): Promise<string> {
    const client = createClient(ctx.url,);
    const res = await client.post<{ id: string }>("/api/worlds", { name, description: `E2E: ${name}`, },);
    return res.data!.id;
  }

  describe("Page load", () => {
    test("worlds page loads with header", async () => {
      const page = await ctx.browser.newPage();
      await gotoWorlds(page,);
      await page.locator("[data-testid='worlds-header']",).waitFor({ state: "attached", timeout: 10_000, },);
      // Title should show "Worlds"
      const title = await page.locator("[data-testid='worlds-header'] .title",).textContent();
      expect(title,).toBe("Worlds",);
      await page.close();
    });

    test("create and import buttons exist", async () => {
      const page = await ctx.browser.newPage();
      await gotoWorlds(page,);
      await page.locator("[data-testid='create-world']",).waitFor({ state: "visible", timeout: 10_000, },);
      await page.locator("[data-testid='import-world']",).waitFor({ state: "visible", timeout: 10_000, },);
      await page.close();
    });
  });

  describe("Create world", () => {
    test("create world modal opens", async () => {
      const page = await ctx.browser.newPage();
      await gotoWorlds(page,);
      await page.locator("[data-testid='create-world']",).waitFor({ state: "visible", timeout: 10_000, },);
      await page.click("[data-testid='create-world']",);
      await page.locator("[data-testid='create-world-modal']",).waitFor({ state: "visible", timeout: 10_000, },);
      await page.close();
    });

    test("create world form has required fields", async () => {
      const page = await ctx.browser.newPage();
      await gotoWorlds(page,);
      await page.click("[data-testid='create-world']",);
      await page.locator("[data-testid='create-world-modal']",).waitFor({ state: "visible", timeout: 10_000, },);
      await page.locator("[data-testid='create-world-form'] #world-name",).waitFor({
        state: "attached",
        timeout: 10_000,
      },);
      await page.locator("[data-testid='create-world-form'] button[type='submit']",).waitFor({
        state: "attached",
        timeout: 10_000,
      },);
      await page.close();
    });
  });

  describe("World list and navigation", () => {
    test("world list renders seeded worlds", async () => {
      // eslint-disable-next-line sonarjs/void-use -- fire-and-forget API call in test setup
      void (await createWorldViaApi("API Created World",));
      const page = await ctx.browser.newPage();
      await gotoWorlds(page,);
      await page.locator("[data-testid='world-list'] .world-name",).first().waitFor({
        state: "attached",
        timeout: 30_000,
      },);
      const worldNames = await page.locator("[data-testid='world-list'] .world-name",).allTextContents();
      expect(worldNames.some((n: string,) => n.includes("API Created World",)),).toBe(true,);
      await page.close();
    });

    test("clicking a world card navigates to detail page", async () => {
      // eslint-disable-next-line sonarjs/void-use -- fire-and-forget API call in test setup
      void (await createWorldViaApi("Detail Test World",));
      const page = await ctx.browser.newPage();
      await gotoWorlds(page,);
      const firstCard = page.locator("[data-testid^='world-card-']",).first();
      await firstCard.waitFor({ state: "visible", timeout: 30_000, },);
      await firstCard.click();
      await page.locator("[data-testid='world-detail-header']",).waitFor({ state: "attached", timeout: 15_000, },);
      expect(page.url(),).toContain("/worlds/",);
      await page.close();
    }, 90_000,);
  });

  describe("Sidebar navigation", () => {
    test("sidebar navigation works from worlds page", async () => {
      const page = await ctx.browser.newPage();
      await gotoWorlds(page,);
      await page.locator("[data-testid='nav-characters']",).waitFor({ state: "visible", timeout: 10_000, },);
      await page.evaluate(() => {
        (document.querySelector("[data-testid='nav-characters']",) as HTMLElement)?.click();
      },);
      await page.locator("[data-testid='characters-header']",).waitFor({ state: "attached", timeout: 15_000, },);
      expect(page.url(),).toContain("/views/characters",);
      await page.close();
    });
  });
});
