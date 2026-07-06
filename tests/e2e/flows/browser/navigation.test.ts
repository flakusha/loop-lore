import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createBrowserTest, type BrowserTestContext } from "../../helpers/browser-server";
import { seedAll } from "../../helpers/seed";

describe("Navigation E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await seedAll(ctx.db);
  }, 45_000);

  afterAll(async () => {
    await ctx.close();
  });

  async function goto(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>, path: string) {
    await page.goto(ctx.url + path, { waitUntil: "networkidle", timeout: 15_000 }).catch(() => {});
    await page.locator("[data-testid='app-root']").waitFor({ state: "attached", timeout: 8000 });
  }

  describe("Sidebar navigation", () => {
    test("navigates from chat to characters via sidebar link", async () => {
      const page = await ctx.browser.newPage();
      await goto(page, "/views/chat");
      await page.locator("[data-testid='nav-characters']").waitFor({ state: "visible", timeout: 8000 });
      await page.click("[data-testid='nav-characters']");
      await page.locator("[data-testid='characters-header']").waitFor({ state: "attached", timeout: 8000 });
      expect(page.url()).toContain("/views/characters");
      await page.close();
    });

    test("navigates from characters to gallery via sidebar link", async () => {
      const page = await ctx.browser.newPage();
      await goto(page, "/views/characters");
      await page.locator("[data-testid='nav-gallery']").waitFor({ state: "visible", timeout: 8000 });
      await page.click("[data-testid='nav-gallery']");
      await page.locator("[data-testid='gallery-header']").waitFor({ state: "attached", timeout: 8000 });
      expect(page.url()).toContain("/views/gallery");
      await page.close();
    });

    test("navigates from gallery to worlds via sidebar link", async () => {
      const page = await ctx.browser.newPage();
      await goto(page, "/views/gallery");
      await page.locator("[data-testid='nav-worlds']").waitFor({ state: "visible", timeout: 8000 });
      await page.click("[data-testid='nav-worlds']");
      await page.locator("[data-testid='worlds-header']").waitFor({ state: "attached", timeout: 8000 });
      expect(page.url()).toContain("/views/worlds");
      await page.close();
    });

    test("navigates from worlds to chat via sidebar link", async () => {
      const page = await ctx.browser.newPage();
      await goto(page, "/views/worlds");
      await page.locator("[data-testid='nav-chat']").waitFor({ state: "visible", timeout: 8000 });
      await page.click("[data-testid='nav-chat']");
      await page.locator("[data-testid='chat-header']").waitFor({ state: "attached", timeout: 8000 });
      expect(page.url()).toContain("/views/chat");
      await page.close();
    });

    test("hamburger button exists and toggles sidebar", async () => {
      const page = await ctx.browser.newPage();
      await goto(page, "/views/chat");
      await page.locator("[data-testid='hamburger']").waitFor({ state: "attached", timeout: 5000 });
      const sidebar = page.locator("[data-testid='sidebar']");
      await page.click("[data-testid='hamburger']");
      const classAttr = await sidebar.getAttribute("class");
      expect(classAttr).toContain("open");
      await page.close();
    });
  });

  describe("Header integrity", () => {
    test("single header-slot exists after multiple navigations (no duplicates)", async () => {
      const page = await ctx.browser.newPage();
      await goto(page, "/views/chat");

      await page.locator("[data-testid='chat-header']").waitFor({ state: "attached", timeout: 5000 });

      // Navigate: chat → characters → gallery → worlds
      await page.click("[data-testid='nav-characters']");
      await page.locator("[data-testid='characters-header']").waitFor({ state: "attached", timeout: 8000 });

      await page.click("[data-testid='nav-gallery']");
      await page.locator("[data-testid='gallery-header']").waitFor({ state: "attached", timeout: 8000 });

      await page.click("[data-testid='nav-worlds']");
      await page.locator("[data-testid='worlds-header']").waitFor({ state: "attached", timeout: 8000 });

      await page.click("[data-testid='nav-chat']");
      await page.locator("[data-testid='chat-header']").waitFor({ state: "attached", timeout: 8000 });
      await page.waitForTimeout(1000);

      const info = await page.evaluate(() => {
        const all = document.querySelectorAll("#header-slot");
        return { count: all.length, headers: [...all].map(h => ({
          parentTag: h.parentElement?.tagName || "",
          parentId: h.parentElement?.id || "",
          testid: h.dataset.testid || "",
          children: h.children.length,
          text: (h.textContent || "").trim().slice(0, 30),
        }))};
      });
      console.log("=== headers:", JSON.stringify(info));

      // Count header-slot elements — should be exactly 1
      const headers = await page.locator("#header-slot").count();
      expect(headers).toBe(1);

      // Verify the visible header has the right testid for the current page
      const headerTestId = await page.locator("#header-slot").getAttribute("data-testid");
      expect(headerTestId).toBe("chat-header");

      await page.close();
    });

    test("header-slot is not duplicated inside #app-root", async () => {
      const page = await ctx.browser.newPage();
      await goto(page, "/views/chat");
      await page.locator("[data-testid='chat-header']").waitFor({ state: "attached", timeout: 5000 });

      // Navigate to characters
      await page.click("[data-testid='nav-characters']");
      await page.locator("[data-testid='characters-header']").waitFor({ state: "attached", timeout: 8000 });
      await page.waitForTimeout(500);

      // Check that #app-root does not contain a #header-slot
      const dupInApp = await page.evaluate(() => {
        const appRoot = document.querySelector("#app-root");
        return appRoot ? appRoot.querySelector("#header-slot") !== null : false;
      });
      expect(dupInApp).toBe(false);

      await page.close();
    });
  });

  describe("New Chat navigation", () => {
    test("navigates to new-chat form and back to chat", async () => {
      const page = await ctx.browser.newPage();
      await goto(page, "/views/chat");
      await page.locator("[data-testid='toggle-chat-list']").waitFor({ state: "attached", timeout: 5000 });

      // Navigate to new-chat via URL
      await page.goto(ctx.url + "/views/new-chat", { waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
      await page.locator("[data-testid='create-chat-form']").waitFor({ state: "attached", timeout: 8000 });
      expect(page.url()).toContain("/views/new-chat");

      // Cancel button should go back to chat
      await page.locator("[data-testid='cancel-create-chat']").waitFor({ state: "attached", timeout: 5000 });
      await page.click("[data-testid='cancel-create-chat']");
      await page.locator("[data-testid='chat-header']").waitFor({ state: "attached", timeout: 8000 });
      expect(page.url()).toContain("/views/chat");

      await page.close();
    });

    test("creates new chat and redirects to chat page", async () => {
      const page = await ctx.browser.newPage();
      await goto(page, "/views/new-chat");
      await page.locator("[data-testid='create-chat-form']").waitFor({ state: "attached", timeout: 8000 });
      await page.locator("[data-testid='chat-name-input']").fill("Browser Test Chat");
      await page.locator("[data-testid='create-chat-btn']").click();
      // Should redirect to /views/chat after creation
      await page.locator("[data-testid='chat-header']").waitFor({ state: "attached", timeout: 8000 });
      expect(page.url()).toContain("/views/chat");
      await page.close();
    });
  });

  describe("Settings navigation", () => {
    test("navigates to settings via sidebar button", async () => {
      const page = await ctx.browser.newPage();
      // Navigate to chat first, then use sidebar
      await goto(page, "/views/chat");
      // Open sidebar via hamburger
      await page.locator("[data-testid='hamburger']").waitFor({ state: "attached", timeout: 5000 });
      await page.click("[data-testid='hamburger']");
      // Click settings gear button in sidebar footer
      await page.locator("[data-testid='nav-settings']").waitFor({ state: "visible", timeout: 5000 });
      await page.click("[data-testid='nav-settings']");
      await page.locator("[data-testid='settings-header']").waitFor({ state: "attached", timeout: 8000 });
      expect(page.url()).toContain("/views/settings");
      await page.close();
    });

    test("settings page has all sections", async () => {
      const page = await ctx.browser.newPage();
      await goto(page, "/views/settings");
      await page.locator("[data-testid='settings-header']").waitFor({ state: "attached", timeout: 5000 });
      await page.locator("[data-testid='settings-general']").waitFor({ state: "attached", timeout: 5000 });
      await page.locator("[data-testid='settings-chat']").waitFor({ state: "attached", timeout: 5000 });
      await page.locator("[data-testid='settings-api']").waitFor({ state: "attached", timeout: 5000 });
      await page.locator("[data-testid='settings-data']").waitFor({ state: "attached", timeout: 5000 });
      await page.close();
    });
  });

  describe("Login navigation", () => {
    test("login page has all required elements", async () => {
      const page = await ctx.browser.newPage();
      await goto(page, "/views/login");
      await page.locator("[data-testid='username-input']").waitFor({ state: "attached", timeout: 5000 });
      await page.locator("[data-testid='password-input']").waitFor({ state: "attached", timeout: 5000 });
      await page.locator("[data-testid='login-submit']").waitFor({ state: "attached", timeout: 5000 });
      await page.locator("[data-testid='demo-login']").waitFor({ state: "attached", timeout: 5000 });
      await page.close();
    });

    test("demo login hx-post attribute is correct", async () => {
      const page = await ctx.browser.newPage();
      await goto(page, "/views/login");
      await page.locator("[data-testid='demo-login']").waitFor({ state: "attached", timeout: 5000 });
      const hxPost = await page.locator("[data-testid='demo-login']").getAttribute("hx-post");
      expect(hxPost).toBe("/api/demo-login");
      await page.close();
    });
  });
});
