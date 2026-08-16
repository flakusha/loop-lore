// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: NSFW Moderation View (admin-gated)
 *
 * Verifies the /views/nsfw-moderation audit view under auth.required=true:
 *  - admin user can load the view (header + consent audit table render)
 *  - non-admin user is redirected away by the admin view guard
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, seedUsers, } from "../../helpers/seed";

describe("NSFW moderation view E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, }, },);
    await seedUsers(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function login(
    page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
    username: string,
    password: string,
  ) {
    await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='login-submit']",).waitFor({ state: "visible", timeout: 30_000, },);
    await page.fill("[data-testid='username-input']", username,);
    await page.fill("[data-testid='password-input']", password,);
    await page.click("[data-testid='login-submit']",);
    await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
  }

  test("admin can load the nsfw moderation audit view", async () => {
    const page = await ctx.openPage();
    let errors: ReturnType<typeof trackPageErrors> | undefined;
    try {
      // Log in first; the login page's own pre-auth 401s are expected noise
      // and must not be captured by the page-error tracker.
      await login(page, SEED.admin.username, SEED.admin.password,);
      errors = trackPageErrors(page,);
      await page.goto(`${ctx.url}/views/nsfw-moderation`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      },);
      await page
        .locator("[data-testid='nsfw-moderation-header']",)
        .waitFor({ state: "visible", timeout: 30_000, },);
      // Consent audit table is server-rendered.
      await page.locator("table.admin-table",).first().waitFor({ state: "visible", timeout: 15_000, },);
    } finally {
      errors?.assert();
      errors?.detach();
      await page.close();
    }
  }, 60_000,);

  test("non-admin is redirected away from the nsfw moderation view", async () => {
    const page = await ctx.openPage();
    let errors: ReturnType<typeof trackPageErrors> | undefined;
    try {
      await login(page, SEED.user.username, SEED.user.password,);
      errors = trackPageErrors(page,);
      await page.goto(`${ctx.url}/views/nsfw-moderation`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      },);
      await page.waitForURL((url,) => url.pathname !== "/views/nsfw-moderation", { timeout: 30_000, },);
      const path = new URL(page.url(),).pathname;
      expect(path,).not.toBe("/views/nsfw-moderation",);
    } finally {
      errors?.assert();
      errors?.detach();
      await page.close();
    }
  }, 60_000,);
});
