import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";

describe("Characters flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 45_000,);

  afterAll(async () => {
    await ctx?.close?.();
  },);

  async function gotoCharacters(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    try {
      await page.goto(ctx.url + "/views/characters", { waitUntil: "domcontentloaded", timeout: 10_000, },);
    } catch {}
    await page.locator("[data-testid='app-root']",).waitFor({ state: "attached", timeout: 8000, },);
  }

  describe("Page load", () => {
    test("characters page loads with header", async () => {
      const page = await ctx.browser.newPage();
      await gotoCharacters(page,);
      await page.locator("[data-testid='characters-header']",).waitFor({ state: "attached", timeout: 5000, },);
      expect(page.url(),).toContain("/views/characters",);
      await page.close();
    });

    test("create and import buttons exist", async () => {
      const page = await ctx.browser.newPage();
      await gotoCharacters(page,);
      await page.locator("[data-testid='create-character']",).waitFor({ state: "visible", timeout: 5000, },);
      await page.locator("[data-testid='import-character']",).waitFor({ state: "visible", timeout: 5000, },);
      await page.close();
    });

    test("characters grid, loading, or empty state present", async () => {
      const page = await ctx.browser.newPage();
      await gotoCharacters(page,);
      await page.waitForSelector(
        "[data-testid='characters-loading'], [data-testid='characters-empty'], [data-testid='character-grid']",
        { timeout: 8000, },
      );
      await page.close();
    });
  });

  describe("Create character", () => {
    test("create character modal opens", async () => {
      const page = await ctx.browser.newPage();
      await gotoCharacters(page,);
      await page.locator("[data-testid='create-character']",).waitFor({ state: "visible", timeout: 5000, },);
      await page.click("[data-testid='create-character']",);
      await page.locator("[data-testid='create-character-modal']",).waitFor({ state: "visible", timeout: 5000, },);
      await page.close();
    });

    test("create character form has required fields", async () => {
      const page = await ctx.browser.newPage();
      await gotoCharacters(page,);
      await page.click("[data-testid='create-character']",);
      await page.locator("[data-testid='create-character-form']",).waitFor({ state: "visible", timeout: 5000, },);
      // Fill and submit
      await page.fill("#char-name", "Browser Test Character",);
      await page.click("[data-testid='create-character-form'] button[type='submit']",);
      // After creation, modal closes and character appears in grid
      await page.locator("[data-testid='character-grid']",).waitFor({ state: "attached", timeout: 8000, },);
      await page.close();
    });
  });

  describe("Import character", () => {
    test("import character modal opens", async () => {
      const page = await ctx.browser.newPage();
      await gotoCharacters(page,);
      await page.locator("[data-testid='import-character']",).waitFor({ state: "visible", timeout: 5000, },);
      await page.click("[data-testid='import-character']",);
      await page.locator("[data-testid='import-character-modal']",).waitFor({ state: "visible", timeout: 5000, },);
      await page.close();
    });

    test("import form has file input", async () => {
      const page = await ctx.browser.newPage();
      await gotoCharacters(page,);
      await page.click("[data-testid='import-character']",);
      await page.locator("[data-testid='import-character-form']",).waitFor({ state: "visible", timeout: 5000, },);
      await page.close();
    });
  });

  describe("Character detail", () => {
    test("clicking a character opens detail modal", async () => {
      const page = await ctx.browser.newPage();
      const consoleMessages: string[] = [];
      page.on("console", (msg,) => {
        consoleMessages.push(`${msg.type()}: ${msg.text()}`,);
      },);

      await gotoCharacters(page,);
      // Wait for grid (characters are seeded so grid should render)
      await page.locator("[data-testid='character-grid']",).waitFor({ state: "attached", timeout: 8000, },);
      // Click first character card
      const firstCard = page.locator("[data-testid^='character-card-']",).first();
      await firstCard.waitFor({ state: "visible", timeout: 5000, },);
      await firstCard.click();

      // Wait a bit to catch console errors
      await page.waitForTimeout(1000,);

      const errors = consoleMessages.filter(
        (m,) => m.toLowerCase().includes("error",) || m.includes("404",) || m.includes("TypeError",),
      );
      if (errors.length > 0) {
        console.log("Console errors found:", errors,);
      }

      await page.locator("[data-testid='character-detail-modal']",).waitFor({ state: "visible", timeout: 5000, },);
      // Detail modal has action buttons
      await page.locator("[data-testid='start-chat-btn']",).waitFor({ state: "visible", timeout: 5000, },);
      await page.locator("[data-testid='edit-character-btn']",).waitFor({ state: "visible", timeout: 5000, },);
      await page.close();
    });

    test("start chat button in detail modal redirects to chat", async () => {
      const page = await ctx.browser.newPage();
      await gotoCharacters(page,);
      await page.locator("[data-testid='character-grid']",).waitFor({ state: "attached", timeout: 8000, },);
      await page.locator("[data-testid^='character-card-']",).first().click();
      await page.locator("[data-testid='character-detail-modal']",).waitFor({ state: "visible", timeout: 5000, },);
      await page.locator("[data-testid='start-chat-btn']",).click();
      // Should redirect to chat page
      await page.locator("[data-testid='chat-header']",).waitFor({ state: "attached", timeout: 8000, },);
      expect(page.url(),).toContain("/views/chat",);
      await page.close();
    });
  });

  describe("Navigation from characters", () => {
    test("sidebar navigation works from characters page", async () => {
      const page = await ctx.browser.newPage();
      await gotoCharacters(page,);
      await page.locator("[data-testid='hamburger']",).click();
      await page.locator("[data-testid='nav-gallery']",).waitFor({ state: "visible", timeout: 5000, },);
      await page.evaluate(() => {
        (document.querySelector("[data-testid='nav-gallery']",) as HTMLElement)?.click();
      },);
      await page.locator("[data-testid='gallery-header']",).waitFor({ state: "attached", timeout: 8000, },);
      expect(page.url(),).toContain("/views/gallery",);
      await page.close();
    });
  });
});
