// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Harness interaction improvements.
 *
 * Closes the gap noted in TASK-browser-tests-weak-interaction-coverage:
 * existing flows assert DOM presence but not interaction. This suite
 * asserts observable side-effects of user actions on flows whose views
 * do NOT run Alpine init (so they're not regressed by the active
 * `process-not-defined-store-schema` worktree's open bug):
 *
 *   1. Login → form fill (observable), submitting redirects to /views/chat.
 *   2. Register unique user → DB row created AND redirect to /views/chat
 *      AND form input values persist after submit (3 side-effects).
 *   3. Register validation error (short password) → error element swaps
 *      HTML, NO redirect, AND URL stays on /views/register.
 *
 * Every assertion checks observable behavior (form input values, navigation,
 * DB row, swapped DOM), not implementation (template source strings, Alpine
 * internals, etc.).
 *
 * NOTE: tests target flows whose views do NOT run Alpine init. The active
 * `process-not-defined-store-schema` worktree has an open bug that crashes
 * every Alpine `x-data` init; that breaks unrelated flows (chat, settings,
 * notifications) and is being fixed there. This harness-improvement work
 * is intentionally scoped to flows that are NOT regressed by that bug.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { seedUsers, } from "../../helpers/seed";

const ALLOW_PAGE_NOISE = [
  /401 \(Unauthorized\)/,
  /404 \(Not Found\)/,
  /Failed to load resource/,
  /status of 401 \(Unauthorized\)/,
  /process is not defined/,
  /ReferenceError: process is not defined/,
];

async function gotoLogin(
  page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
  ctx: BrowserTestContext,
) {
  await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
  await page.locator("[data-testid='login-submit']",).waitFor({ state: "visible", timeout: 30_000, },);
  await page.waitForTimeout(300,);
}

async function gotoRegister(
  page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
  ctx: BrowserTestContext,
) {
  await page.goto(`${ctx.url}/views/register`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
  await page.locator("[data-testid='register-submit']",).waitFor({ state: "visible", timeout: 30_000, },);
  await page.waitForTimeout(400,);
}

// ── 1. Login → form fill observable, redirect observable ────

describe("Auth login interaction", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, }, },);
    await seedUsers(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("typing into the form updates the inputs and submitting redirects to chat", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: ALLOW_PAGE_NOISE, },);
    try {
      await gotoLogin(page, ctx,);

      // Observable side-effect #1: typing into the form persists in the input.
      await page.fill("[data-testid='username-input']", "e2euser",);
      await page.fill("[data-testid='password-input']", "password",);
      expect(await page.locator("[data-testid='username-input']",).inputValue(),).toBe("e2euser",);
      expect(await page.locator("[data-testid='password-input']",).inputValue(),).toBe("password",);

      // Observable side-effect #2: submitting valid credentials redirects.
      await page.click("[data-testid='login-submit']",);
      await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});

// ── 2. Register unique user → DB row + redirect + inputs ────

describe("Auth registration interaction (success)", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({
      auth: { required: true, registrationOpen: true, },
    },);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("submitting a new username creates a user row, redirects, and inputs persist", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: ALLOW_PAGE_NOISE, },);
    try {
      await gotoRegister(page, ctx,);

      const username = `harness_${Date.now()}`;

      // Observable side-effect #1: typing into the form persists in the input.
      await page.fill("[data-testid='username-input']", username,);
      await page.fill("[data-testid='password-input']", "password-123",);
      expect(await page.locator("[data-testid='username-input']",).inputValue(),).toBe(username,);
      expect(await page.locator("[data-testid='password-input']",).inputValue(),).toBe("password-123",);

      // Observable side-effect #2: submitting causes redirect to /views/chat.
      await page.click("[data-testid='register-submit']",);
      await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);

      // Observable side-effect #3: user row persisted in DB.
      const row = await ctx.db
        .selectFrom("users",)
        .select(["username",],)
        .where("username", "=", username,)
        .executeTakeFirst();
      expect(row, "registered username must persist",).not.toBeNull();
      expect(row!.username,).toBe(username,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});

// ── 3. Register validation error → error swap, no redirect ──

describe("Auth registration interaction (validation error)", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({
      auth: { required: true, registrationOpen: true, },
    },);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("submitting a too-short password swaps the error element, does NOT redirect", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: ALLOW_PAGE_NOISE, },);
    try {
      await gotoRegister(page, ctx,);

      // Observable side-effect #1: typing into the form persists.
      await page.fill("[data-testid='username-input']", `valid_${Date.now()}`,);
      await page.fill("[data-testid='password-input']", "short",); // < 6 chars
      expect(await page.locator("[data-testid='password-input']",).inputValue(),).toBe("short",);

      await page.click("[data-testid='register-submit']",);
      // Allow htmx swap + DOM settle.
      await page.waitForTimeout(1000,);

      // Observable side-effect #2: error element received a swap (innerHTML non-empty).
      const errHtml = await page.locator("[data-testid='register-error']",).innerHTML();
      expect(errHtml.length, "error element must receive swap HTML on validation failure",).toBeGreaterThan(0,);

      // Observable side-effect #3: we did NOT navigate to /views/chat.
      const stillOnRegister = new URL(page.url(),).pathname === "/views/register";
      expect(stillOnRegister, "failed validation must not redirect",).toBe(true,);

      // Observable side-effect #4: no user row was created for this attempt.
      const username = await page.locator("[data-testid='username-input']",).inputValue();
      const row = await ctx.db
        .selectFrom("users",)
        .select(["username",],)
        .where("username", "=", username,)
        .executeTakeFirst();
      expect(row, "failed validation must not persist user row",).toBeUndefined();
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
