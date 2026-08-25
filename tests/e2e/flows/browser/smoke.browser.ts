// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Smoke Tests
 *
 * Verifies every view loads, renders key elements, has correct structure.
 * Uses data-testid attributes for stable selectors.
 * Each top-level describe creates its own page for isolation.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";

describe("Smoke E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  /** Navigate and wait for page to settle */
  async function gotoView(
    page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
    path: string,
  ) {
    try {
      await page.goto(ctx.url + path, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    } catch {
      // navigation errors are handled by subsequent element waits
    }
    // Wait for app-root (layout wraps all views)
    await page.locator("[data-testid='app-root']",).waitFor({ state: "attached", timeout: 15_000, },);
  }

  // ── Chat view ─────────────────────────────────────────────────

  describe("Chat view", () => {
    test("loads chat page with message list container", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await page.waitForSelector("[data-testid='message-list']", { timeout: 10_000, },);
        expect(await page.isVisible("[data-testid='message-list']",),).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("has message input and send button", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await page.waitForSelector("[data-testid='message-input']", { state: "attached", timeout: 10_000, },);
        await page.waitForSelector("[data-testid='send-button']", { state: "attached", timeout: 10_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("has sidebar toggle buttons", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await page.locator("[data-testid='toggle-chat-list']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='toggle-gallery']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='toggle-character-info']",).waitFor({ state: "attached", timeout: 10_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  // ── Characters view ───────────────────────────────────────────

  describe("Characters view", () => {
    test("loads characters page", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/characters",);
        // Should show loading, empty, or grid state
        await page.waitForSelector(
          "[data-testid='characters-loading'], [data-testid='characters-empty'], [data-testid='character-grid']",
          { timeout: 10_000, },
        );
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("create character button exists", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/characters",);
        await page.waitForSelector("[data-testid='create-character']", { timeout: 10_000, },);
        expect(await page.isVisible("[data-testid='create-character']",),).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("import character button exists", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/characters",);
        await page.waitForSelector("[data-testid='import-character']", { timeout: 10_000, },);
        expect(await page.isVisible("[data-testid='import-character']",),).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  // ── Gallery view ──────────────────────────────────────────────

  describe("Gallery view", () => {
    test("loads gallery page", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/gallery",);
        // Behavioral: loading must resolve to a rendered grid or empty state
        // (OR-locator would pass even with broken grid render).
        await page.waitForSelector("[data-testid='gallery-loading']", {
          state: "detached",
          timeout: 10_000,
        },);
        const resolved = await page
          .locator("[data-testid='asset-grid'], [data-testid='gallery-empty']",)
          .count();
        expect(resolved,).toBeGreaterThan(0,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("upload button exists", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/gallery",);
        await page.waitForSelector("[data-testid='upload-button']", { timeout: 10_000, },);
        expect(await page.isVisible("[data-testid='upload-button']",),).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  // ── Settings view ─────────────────────────────────────────────

  describe("Settings view", () => {
    test("loads settings page with header and tabs", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/settings",);
        await page.waitForSelector("[data-testid='settings-header']", { timeout: 10_000, },);
        // Tab buttons should always be visible (they're not gated by x-show)
        const tabButtons = page.locator(".world-edit-tab",);
        const count = await tabButtons.count();
        expect(count,).toBeGreaterThan(0,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("theme and locale selectors exist in DOM", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/settings",);
        await page.waitForSelector("[data-testid='settings-header']", { timeout: 10_000, },);
        // Elements exist in DOM (may be hidden by Alpine x-show until tab is active)
        await page.locator("[data-testid='theme-select']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='locale-select']",).waitFor({ state: "attached", timeout: 10_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  // ── Worlds view ───────────────────────────────────────────────

  describe("Worlds view", () => {
    test("loads worlds page", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/worlds",);
        // Header is always rendered (not in x-if)
        await page.waitForSelector("header .title", { timeout: 10_000, },);
        const title = await page.textContent("header .title",);
        expect(title,).toBe("Worlds",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("create world button exists", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/worlds",);
        await page.locator("[data-testid='create-world']",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(await page.isVisible("[data-testid='create-world']",),).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  // ── New Chat view ─────────────────────────────────────────────

  describe("New Chat view", () => {
    test("loads new chat form with all fields", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/new-chat",);
        await page.locator("[data-testid='create-chat-form']",).waitFor({ state: "attached", timeout: 30_000, },);
        await page.locator("[data-testid='chat-name-input']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='chat-type-select']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='chat-mode-select']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='create-chat-btn']",).waitFor({ state: "attached", timeout: 10_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("can type chat name", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/new-chat",);
        await page.locator("[data-testid='chat-name-input']",).waitFor({ state: "attached", timeout: 30_000, },);
        const input = page.locator("[data-testid='chat-name-input']",);
        await input.fill("Test Chat from Browser",);
        expect(await input.inputValue(),).toBe("Test Chat from Browser",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  // ── Login view ────────────────────────────────────────────────

  describe("Login view", () => {
    test("loads login form", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/login",);
        await page.locator("[data-testid='username-input']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='password-input']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='login-submit']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='demo-login']",).waitFor({ state: "attached", timeout: 10_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("demo login link has correct hx-post", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/login",);
        await page.locator("[data-testid='demo-login']",).waitFor({ state: "attached", timeout: 15_000, },);
        const link = page.locator("[data-testid='demo-login']",);
        expect(await link.getAttribute("hx-post",),).toBe("/api/demo-login",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  // ── Layout / Navigation ───────────────────────────────────────

  describe("Layout navigation", () => {
    test("sidebar rendered on chat view", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await page.locator("[data-testid='sidebar']",).waitFor({ state: "attached", timeout: 10_000, },);
        expect(await page.locator("[data-testid='nav-chat']",).isVisible(),).toBe(true,);
        expect(await page.locator("[data-testid='nav-characters']",).isVisible(),).toBe(true,);
        expect(await page.locator("[data-testid='nav-gallery']",).isVisible(),).toBe(true,);
        expect(await page.locator("[data-testid='nav-worlds']",).isVisible(),).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("nav links have expected htmx attributes", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await page.locator("[data-testid='nav-chat']",).waitFor({ state: "attached", timeout: 10_000, },);
        expect(await page.locator("[data-testid='nav-chat']",).getAttribute("hx-get",),).toBe("/views/chat-list",);
        expect(await page.locator("[data-testid='nav-characters']",).getAttribute("hx-get",),).toBe(
          "/views/characters",
        );
        expect(await page.locator("[data-testid='nav-gallery']",).getAttribute("hx-get",),).toBe("/views/gallery",);
        expect(await page.locator("[data-testid='nav-worlds']",).getAttribute("hx-get",),).toBe("/views/worlds",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("hamburger toggles sidebar open class", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/settings",);
        await page.locator("[data-testid='sidebar']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.locator("[data-testid='hamburger']",).waitFor({ state: "attached", timeout: 10_000, },);
        await page.click("[data-testid='hamburger']",);
        const classAttr = await page.locator("[data-testid='sidebar']",).getAttribute("class",);
        expect(classAttr,).toContain("open",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });
});
