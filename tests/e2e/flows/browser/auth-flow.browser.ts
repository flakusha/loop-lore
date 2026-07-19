/**
 * Browser E2E: Auth Flow
 *
 * Tests login form, demo mode login, and auth-dependent rendering.
 * Each test creates its own page for isolation.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { seedUsers, } from "../../helpers/seed";

describe("Auth browser E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, }, },);
    await seedUsers(ctx.db,);
  }, 45_000,);

  afterAll(async () => {
    await ctx.close();
  },);

  async function gotoLogin(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.goto(ctx.url + "/views/login", { waitUntil: "domcontentloaded", timeout: 10_000, },);
    await page.waitForSelector("[data-testid='login-submit']", { timeout: 5000, },);
  }

  describe("Login form", () => {
    test("renders username, password, submit", async () => {
      const page = await ctx.browser.newPage();
      await gotoLogin(page,);
      expect(await page.isVisible("[data-testid='username-input']",),).toBe(true,);
      expect(await page.isVisible("[data-testid='password-input']",),).toBe(true,);
      expect(await page.isVisible("[data-testid='login-submit']",),).toBe(true,);
      await page.close();
    });

    test("demo login link present", async () => {
      const page = await ctx.browser.newPage();
      await gotoLogin(page,);
      expect(await page.isVisible("[data-testid='demo-login']",),).toBe(true,);
      expect(await page.locator("[data-testid='demo-login']",).getAttribute("hx-post",),).toBe("/api/demo-login",);
      await page.close();
    });

    test("signup link present", async () => {
      const page = await ctx.browser.newPage();
      await gotoLogin(page,);
      expect(await page.isVisible("[data-testid='signup-link']",),).toBe(true,);
      await page.close();
    });
  });

  describe("Login validation", () => {
    test("submits login form with htmx", async () => {
      const page = await ctx.browser.newPage();
      await gotoLogin(page,);
      await page.fill("[data-testid='username-input']", "wronguser",);
      await page.fill("[data-testid='password-input']", "wrongpass",);
      // Submit triggers htmx POST to /api/auth/login
      await page.click("[data-testid='login-submit']",);
      // htmx swaps the response into #login-error (style stays display:none on outer div)
      await page.waitForTimeout(1500,);
      // The error element should have received a swap (innerHTML changed)
      const innerHtml = await page.locator("[data-testid='login-error']",).innerHTML();
      // After htmx swap, innerHTML should either be non-empty error message
      // or the style might have changed if the server returns styled HTML
      expect(innerHtml.length,).toBeGreaterThan(0,);
      await page.close();
    });
  });
});
