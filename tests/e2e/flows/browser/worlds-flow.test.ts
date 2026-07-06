import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createBrowserTest, type BrowserTestContext } from "../../helpers/browser-server";
import { seedAll } from "../../helpers/seed";

describe("Worlds flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await seedAll(ctx.db);
  }, 45_000);

  afterAll(async () => {
    await ctx.close();
  });

  async function gotoWorlds(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>) {
    await page.goto(ctx.url + "/views/worlds", { waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
    await page.locator("[data-testid='app-root']").waitFor({ state: "attached", timeout: 8000 });
  }

  describe("Page load", () => {
    test("worlds page loads with header", async () => {
      const page = await ctx.browser.newPage();
      await gotoWorlds(page);
      await page.locator("[data-testid='worlds-header']").waitFor({ state: "attached", timeout: 5000 });
      // Title should show "Worlds"
      const title = await page.locator("[data-testid='worlds-header'] .title").textContent();
      expect(title).toBe("Worlds");
      await page.close();
    });

    test("create and import buttons exist", async () => {
      const page = await ctx.browser.newPage();
      await gotoWorlds(page);
      await page.locator("[data-testid='create-world']").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("[data-testid='import-world']").waitFor({ state: "visible", timeout: 5000 });
      await page.close();
    });
  });

  describe("Create world", () => {
    test("create world modal opens", async () => {
      const page = await ctx.browser.newPage();
      await gotoWorlds(page);
      await page.locator("[data-testid='create-world']").waitFor({ state: "visible", timeout: 5000 });
      await page.click("[data-testid='create-world']");
      await page.locator("[data-testid='create-world-modal']").waitFor({ state: "visible", timeout: 5000 });
      await page.close();
    });

    test("create world form submits and creates world", async () => {
      const page = await ctx.browser.newPage();
      await gotoWorlds(page);
      await page.click("[data-testid='create-world']");
      await page.locator("[data-testid='create-world-modal']").waitFor({ state: "visible", timeout: 5000 });
      await page.fill("#world-name", "Browser Test World");
      await page.fill("#world-description", "A world created by browser E2E test");
      await page.locator("[data-testid='create-world-form'] button[type='submit']").click();
      // After creation, modal closes and world appears in list
      await page.locator("[data-testid='world-list']").waitFor({ state: "attached", timeout: 8000 });
      const worldNames = await page.locator("[data-testid='world-list'] .world-name").allTextContents();
      expect(worldNames.some((n: string) => n.includes("Browser Test World"))).toBe(true);
      await page.close();
    });
  });

  describe("World list and navigation", () => {
    test("world list renders after creating a world", async () => {
      const page = await ctx.browser.newPage();
      await gotoWorlds(page);
      // Create a world first
      await page.click("[data-testid='create-world']");
      await page.fill("#world-name", "Navigation Test World");
      await page.locator("[data-testid='create-world-form'] button[type='submit']").click();
      await page.locator("[data-testid='world-list']").waitFor({ state: "attached", timeout: 8000 });
      const cards = await page.locator("[data-testid^='world-card-']").count();
      expect(cards).toBeGreaterThan(0);
      await page.close();
    });

    test("clicking a world navigates to detail page", async () => {
      const page = await ctx.browser.newPage();
      await gotoWorlds(page);
      // Create a world first
      await page.click("[data-testid='create-world']");
      await page.fill("#world-name", "Detail Test World");
      await page.locator("[data-testid='create-world-form'] button[type='submit']").click();
      await page.locator("[data-testid='world-list']").waitFor({ state: "attached", timeout: 8000 });
      // Click the first world card
      const firstCard = page.locator("[data-testid^='world-card-']").first();
      await firstCard.waitFor({ state: "visible", timeout: 5000 });
      await firstCard.click();
      // Should navigate to world detail page
      await page.locator("[data-testid='world-detail-header']").waitFor({ state: "attached", timeout: 8000 });
      expect(page.url()).toContain("/worlds/");
      await page.close();
    });
  });

  describe("Sidebar navigation", () => {
    test("sidebar navigation works from worlds page", async () => {
      const page = await ctx.browser.newPage();
      await gotoWorlds(page);
      await page.locator("[data-testid='nav-characters']").waitFor({ state: "visible", timeout: 5000 });
      await page.click("[data-testid='nav-characters']");
      await page.locator("[data-testid='characters-header']").waitFor({ state: "attached", timeout: 8000 });
      expect(page.url()).toContain("/views/characters");
      await page.close();
    });
  });
});
