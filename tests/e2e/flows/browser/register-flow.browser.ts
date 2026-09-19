// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Registration Flow
 *
 * Verifies the /views/register flow: a valid submission creates the user and
 * redirects to /views/chat (htmx HX-Redirect); an invalid/duplicate
 * submission surfaces an error in the register-error target.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { AUTH_NOISE_ALLOWLIST, trackPageErrors, } from "../../helpers/htmx-alpine";

describe("Registration flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, registrationOpen: true, }, },);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoRegister(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.goto(`${ctx.url}/views/register`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='register-submit']",).waitFor({ state: "visible", timeout: 30_000, },);
    // sleep: form readiness — Alpine binding may lag domcontentloaded
    await page.waitForTimeout(400,);
  }

  describe("Register form", () => {
    test("renders username + password + submit", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
      try {
        await gotoRegister(page,);
        expect(await page.isVisible("[data-testid='username-input']",),).toBe(true,);
        expect(await page.isVisible("[data-testid='password-input']",),).toBe(true,);
        expect(await page.isVisible("[data-testid='register-submit']",),).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);

    test("registers a new user and redirects to chat", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, {
        // Allowlist benign 401 console noise during the auth transition; the
        // real assertion is the user row + redirect below.
        allowlist: [/status of 401 \(Unauthorized\)/,],
      },);
      try {
        await gotoRegister(page,);
        const username = `browser_${Date.now()}`;
        await page.fill("[data-testid='username-input']", username,);
        await page.fill("[data-testid='password-input']", "password-123",);
        await page.click("[data-testid='register-submit']",);

        // htmx follows HX-Redirect /views/chat on success.
        await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);

        // User persisted.
        const row = await ctx.db
          .selectFrom("users",)
          .select(["username",],)
          .where("username", "=", username,)
          .executeTakeFirst();
        expect(row,).not.toBeNull();
        expect(row!.username,).toBe(username,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);

    test("duplicate username swaps register-error and stays on register", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
      const username = `dup_${Date.now()}`;
      try {
        await gotoRegister(page,);
        await page.fill("[data-testid='username-input']", username,);
        await page.fill("[data-testid='password-input']", "password-123",);
        await page.click("[data-testid='register-submit']",);
        // First submission must succeed and land on the authed view.
        await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }

      // Second submission from a fresh page.
      const page2 = await ctx.openPage();
      const errors2 = trackPageErrors(page2, { allowlist: AUTH_NOISE_ALLOWLIST, },);
      try {
        await gotoRegister(page2,);
        await page2.fill("[data-testid='username-input']", username,);
        await page2.fill("[data-testid='password-input']", "password-123",);
        await page2.click("[data-testid='register-submit']",);

        // Wait for the swap to land, then read it: the server swaps the
        // duplicate-user error into #register-error (htmx requests get
        // 200 + HTML error envelope).
        await page2.locator("[data-testid='register-error']:not(:empty)",).waitFor({
          state: "visible",
          timeout: 10_000,
        },);
        const errHtml = await page2.locator("[data-testid='register-error']",).innerHTML();
        expect(errHtml.length, "duplicate registration must surface an error message",).toBeGreaterThan(0,);
        expect(new URL(page2.url(),).pathname, "duplicate registration must not redirect",).toBe("/views/register",);

        // Exactly one user row for the attempted username.
        const rows = await ctx.db
          .selectFrom("users",)
          .select(["username",],)
          .where("username", "=", username,)
          .execute();
        expect(rows.length,).toBe(1,);
      } finally {
        errors2.assert();
        errors2.detach();
        await page2.close();
      }
    }, 60_000,);
  });
});

describe("Registration closed E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, registrationOpen: false, }, },);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("submitting the form surfaces the closed-registration error and creates no user", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    const username = `closed_${Date.now()}`;
    try {
      await page.goto(`${ctx.url}/views/register`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='register-submit']",).waitFor({ state: "visible", timeout: 30_000, },);
      await page.fill("[data-testid='username-input']", username,);
      await page.fill("[data-testid='password-input']", "password-123",);
      await page.click("[data-testid='register-submit']",);

      // Wait for the htmx error envelope to swap into #register-error.
      await page.locator("[data-testid='register-error']:not(:empty)",).waitFor({
        state: "visible",
        timeout: 10_000,
      },);
      const errHtml = await page.locator("[data-testid='register-error']",).innerHTML();
      expect(errHtml.length, "closed registration must surface an error message",).toBeGreaterThan(0,);
      expect(new URL(page.url(),).pathname,).toBe("/views/register",);

      const row = await ctx.db
        .selectFrom("users",)
        .select(["username",],)
        .where("username", "=", username,)
        .executeTakeFirst();
      expect(row, "closed registration must not persist a user",).toBeUndefined();
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
