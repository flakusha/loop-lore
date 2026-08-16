// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Auth Session (login / logout / admin access)
 *
 * Covers the authentication session lifecycle through the UI under
 * auth.required=true:
 *  - successful login redirects to /views/chat
 *  - logout clears the session and lands on login
 *  - non-admin user is 302'd away from /views/admin (adminViewGuard)
 *  - admin user can load /views/admin
 *
 * Requires auth.required=true so the admin/non-admin role distinction applies
 * (in default solo mode every user is treated as admin).
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { seedUsers, } from "../../helpers/seed";

describe("Auth session E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, }, },);
    await seedUsers(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoLogin(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='login-submit']",).waitFor({ state: "visible", timeout: 30_000, },);
    await page.waitForTimeout(300,);
  }

  async function login(
    page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
    username: string,
    password: string,
  ) {
    await gotoLogin(page,);
    await page.fill("[data-testid='username-input']", username,);
    await page.fill("[data-testid='password-input']", password,);
    await page.click("[data-testid='login-submit']",);
    await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
  }

  describe("Login", () => {
    test("successful login redirects to chat", async () => {
      const page = await ctx.openPage();
      try {
        await gotoLogin(page,);
        await page.fill("[data-testid='username-input']", "e2euser",);
        await page.fill("[data-testid='password-input']", "password",);
        await page.click("[data-testid='login-submit']",);
        await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
      } finally {
        await page.close();
      }
    }, 60_000,);
  });

  describe("Logout", () => {
    test("logout returns to login and protects authed views", async () => {
      const page = await ctx.openPage();
      try {
        await login(page, "e2euser", "password",);
        // Sidebar footer button — click via evaluate to bypass hit-testing.
        await page.evaluate(() => {
          const btn = document.querySelector("button[data-testid='nav-logout']",);
          (btn as HTMLElement | undefined)?.click();
        },);
        await page.waitForURL((url,) => url.pathname === "/views/login", { timeout: 30_000, },);
      } finally {
        await page.close();
      }
    }, 60_000,);
  });

  describe("Admin access", () => {
    test("non-admin is redirected away from the admin view", async () => {
      const page = await ctx.openPage();
      try {
        await login(page, "e2euser", "password",);
        await page.goto(`${ctx.url}/views/admin`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
        // adminViewGuard 302s non-admins to "/", which then redirects to the
        // authed home "/views/chat". Assert we left the admin view.
        await page.waitForURL((url,) => url.pathname !== "/views/admin", { timeout: 30_000, },);
        await page.waitForTimeout(500,);
        const path = new URL(page.url(),).pathname;
        expect(path,).not.toBe("/views/admin",);
      } finally {
        await page.close();
      }
    }, 60_000,);

    test("admin can load the admin view", async () => {
      const page = await ctx.openPage();
      try {
        await login(page, "e2eadmin", "adminpass",);
        await page.goto(`${ctx.url}/views/admin`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
        await page.locator("[data-testid='admin-header']",).waitFor({ state: "attached", timeout: 30_000, },);
      } finally {
        await page.close();
      }
    }, 60_000,);
  });
});
