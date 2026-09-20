// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Admin vs Non-Admin view guards
 *
 * Verifies the admin-guarded views under auth.required=true:
 *  - admin user (seed `e2eadmin`) can load /views/admin and /views/nsfw-moderation
 *  - non-admin user (seed `e2euser`) is redirected away (adminViewGuard 302 -> "/")
 *
 * Companion to auth-session.browser.ts and nsfw-moderation-flow.browser.ts.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { AUTH_NOISE_ALLOWLIST, trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, seedUsers, } from "../../helpers/seed";

type TestPage = Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>;

describe("Admin guard E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, }, },);
    await seedUsers(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function login(page: TestPage, username: string, password: string,) {
    await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='login-submit']",).waitFor({ state: "visible", timeout: 30_000, },);
    await page.fill("[data-testid='username-input']", username,);
    await page.fill("[data-testid='password-input']", password,);
    await page.click("[data-testid='login-submit']",);
    await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
  }

  test("admin loads /views/admin and /views/nsfw-moderation", async () => {
    const page = await ctx.openPage();
    await login(page, SEED.admin.username, SEED.admin.password,);
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    try {
      await page.goto(`${ctx.url}/views/admin`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='admin-header']",).waitFor({ state: "attached", timeout: 30_000, },);

      await page.goto(`${ctx.url}/views/nsfw-moderation`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      },);
      await page
        .locator("[data-testid='nsfw-moderation-header']",)
        .waitFor({ state: "visible", timeout: 30_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 90_000,);

  test("non-admin is redirected away from /views/admin (302 -> /)", async () => {
    const page = await ctx.openPage();
    await login(page, SEED.user.username, SEED.user.password,);
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    try {
      await page.goto(`${ctx.url}/views/admin`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      // adminViewGuard 302s to "/" which redirects to /views/chat.
      await page.waitForURL((url,) => url.pathname !== "/views/admin", { timeout: 30_000, },);
      const path = new URL(page.url(),).pathname;
      expect(path,).not.toBe("/views/admin",);
      expect(path,).toBe("/views/chat",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
