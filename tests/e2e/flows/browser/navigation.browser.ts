// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { waitForAlpineReady, } from "../../helpers/htmx-alpine";
import { seedAll, } from "../../helpers/seed";

describe("Navigation E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await seedAll(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function goto(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>, path: string,) {
    await page.setViewportSize({ width: 1440, height: 900, },);
    await page.goto(ctx.url + path, { waitUntil: "commit", timeout: 30_000, },);
    await page.locator("[data-testid='app-root']",).waitFor({ state: "attached", timeout: 30_000, },);
    await waitForAlpineReady(page,);
    // Settle: Alpine store exists + DOM processed, but event handlers
    // on nested elements may take an extra tick to bind
    await page.waitForTimeout(500,);
  }

  async function clickNav(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>, selector: string,) {
    await page.evaluate((sel,) => {
      (document.querySelector(sel,) as HTMLElement)?.click();
    }, selector,);
  }

  describe("Sidebar navigation", () => {
    test("navigates from chat to characters via sidebar link", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/chat",);
        await page.locator("[data-testid='hamburger']",).click({ force: true, },);
        await page.locator("[data-testid='nav-characters']",).waitFor({ state: "attached", timeout: 10_000, },);
        await clickNav(page, "[data-testid='nav-characters']",);
        await page.locator("[data-testid='characters-header']",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(page.url(),).toContain("/views/characters",);
      } finally {
        await page.close();
      }
    }, 90_000,);

    test("navigates from characters to gallery via sidebar link", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/characters",);
        await page.locator("[data-testid='hamburger']",).click({ force: true, },);
        await page.locator("[data-testid='nav-gallery']",).waitFor({ state: "attached", timeout: 10_000, },);
        await clickNav(page, "[data-testid='nav-gallery']",);
        await page.locator("[data-testid='gallery-header']",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(page.url(),).toContain("/views/gallery",);
      } finally {
        await page.close();
      }
    }, 90_000,);

    test("navigates from gallery to worlds via sidebar link", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/gallery",);
        await page.locator("[data-testid='hamburger']",).click({ force: true, },);
        await page.locator("[data-testid='nav-worlds']",).waitFor({ state: "attached", timeout: 10_000, },);
        await clickNav(page, "[data-testid='nav-worlds']",);
        await page.locator("[data-testid='worlds-header']",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(page.url(),).toContain("/views/worlds",);
      } finally {
        await page.close();
      }
    }, 90_000,);

    test("navigates from worlds to chat via sidebar link", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/worlds",);
        await page.locator("[data-testid='hamburger']",).click({ force: true, },);
        await page.locator("[data-testid='nav-chat']",).waitFor({ state: "attached", timeout: 10_000, },);
        await clickNav(page, "[data-testid='nav-chat']",);
        await page.locator("#page-title",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(page.url(),).toContain("/views/chat-list",);
      } finally {
        await page.close();
      }
    }, 90_000,);

    test("hamburger button exists and toggles sidebar", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/chat",);
        await page.locator("[data-testid='hamburger']",).waitFor({ state: "attached", timeout: 10_000, },);
        // Use evaluate to click — avoids Playwright hit-test interception
        await page.evaluate(() => {
          const btn = document.querySelector("[data-testid='hamburger']",);
          if (btn instanceof HTMLElement) { btn.click(); }
        },);
        await page.waitForTimeout(300,);
        const hasOpen = await page.evaluate(() => {
          return document.querySelector("[data-testid='sidebar']",)?.classList.contains("open",) ?? false;
        },);
        expect(hasOpen,).toBe(true,);
      } finally {
        await page.close();
      }
    });
  });

  describe("Header integrity", () => {
    test("single header-slot exists in DOM", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/chat",);
        await page.locator("[data-testid='chat-header']",).waitFor({ state: "attached", timeout: 10_000, },);
        const headers = await page.locator("#header-slot",).count();
        expect(headers,).toBe(1,);
      } finally {
        await page.close();
      }
    });

    test("header-slot has correct testid for current page", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/chat",);
        await page.locator("[data-testid='chat-header']",).waitFor({ state: "attached", timeout: 10_000, },);
        const headerTestId = await page.locator("#header-slot",).getAttribute("data-testid",);
        expect(headerTestId,).toBe("chat-header",);
      } finally {
        await page.close();
      }
    });
  });

  describe("New Chat navigation", () => {
    test("navigates to new-chat form", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/new-chat",);
        await page.locator("[data-testid='create-chat-form']",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(page.url(),).toContain("/views/new-chat",);
      } finally {
        await page.close();
      }
    });

    test("creates new chat and redirects to chat page", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/new-chat",);
        await page.locator("[data-testid='create-chat-form']",).waitFor({ state: "attached", timeout: 15_000, },);
        // loadNewChatPage() is only called on htmx:load — page.goto() bypasses htmx,
        // so we must manually initialize the form submit handler
        await page.evaluate(() => {
          (globalThis as any).loadNewChatPage?.();
        },);
        await page.locator("[data-testid='chat-name-input']",).fill("Browser Test Chat",);
        await page.locator("[data-testid='create-chat-btn']",).click();
        await page.locator("[data-testid='chat-header']",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(page.url(),).toContain("/views/chat",);
      } finally {
        await page.close();
      }
    });
  });

  describe("Settings navigation", () => {
    test("navigates to settings page", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/settings",);
        await page.locator("[data-testid='settings-header']",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(page.url(),).toContain("/views/settings",);
      } finally {
        await page.close();
      }
    });

    test("settings page has header and tabs", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/settings",);
        await page.locator("[data-testid='settings-header']",).waitFor({ state: "attached", timeout: 10_000, },);
        const tabButtons = page.locator(".world-edit-tab",);
        const count = await tabButtons.count();
        expect(count,).toBeGreaterThan(0,);
      } finally {
        await page.close();
      }
    });
  });

  describe("Login navigation", () => {
    test("login page has all required elements", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/login",);
        await page.locator("[data-testid='username-input']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='password-input']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='login-submit']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='demo-login']",).waitFor({ state: "attached", timeout: 10_000, },);
      } finally {
        await page.close();
      }
    });

    test("demo login hx-post attribute is correct", async () => {
      const page = await ctx.browser.newPage();
      try {
        await goto(page, "/views/login",);
        await page.locator("[data-testid='demo-login']",).waitFor({ state: "attached", timeout: 10_000, },);
        const hxPost = await page.locator("[data-testid='demo-login']",).getAttribute("hx-post",);
        expect(hxPost,).toBe("/api/demo-login",);
      } finally {
        await page.close();
      }
    });
  });
});
