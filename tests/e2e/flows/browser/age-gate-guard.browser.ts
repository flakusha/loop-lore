// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Age Gate guard — the gated → accept → unblocked journey.
 *
 * This is the coverage unit tests cannot give. The redirect lives in Alpine
 * `app().init()`, so a redirect LOOP is only observable in a real browser:
 * `page.waitForURL` against a looping guard never resolves, and the settle
 * windows catch a self-bounce that resolves too fast. A mocked-fetch unit test
 * would happily pass a looping guard.
 *
 * Config matrix:
 *   - gate ENABLED, not accepted → landing anywhere bounces to /views/age-gate
 *   - gate DISABLED             → nothing redirects (the no-bounce leg)
 *   - accepted user             → nothing redirects
 */

import type { Page, } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, seedUsers, } from "../../helpers/seed";

/** Pre-login 401s (favicon etc.) are benign; anything else is a real defect. */
const NOISE_ALLOWLIST = [/401 \(Unauthorized\)/, /Failed to load resource/,];

async function login(page: Page, ctx: BrowserTestContext,) {
  await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
  await page.locator("[data-testid='login-submit']",).waitFor({ state: "visible", timeout: 30_000, },);
  await page.fill("[data-testid='username-input']", SEED.user.username,);
  await page.fill("[data-testid='password-input']", SEED.user.password,);
  await page.click("[data-testid='login-submit']",);
  await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
}

/**
 * Wait for the submit button to reach a disabled state.
 *
 * Plain `expect.poll` is Vitest — bun:test has no such API (it threw
 * `expect.poll is not a function` in the first run). Polling by hand keeps the
 * assertion on the real Alpine-bound `disabled` property.
 * @param locator - the submit button locator
 * @param want - expected disabled state
 */
async function waitForDisabled(locator: ReturnType<Page["locator"]>, want: boolean,) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await locator.isDisabled() === want) { return; }

    const { promise, resolve, } = Promise.withResolvers<void>();
    setTimeout(resolve, 100,);
    await promise;
  }

  throw new Error(`submit button never reached disabled=${want}`,);
}

describe("Age gate guard E2E — gate ENABLED", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({
      auth: { required: true, },
      ageGate: { enabled: true, minimumAge: 18, mode: "self-declaration", },
    },);

    await seedUsers(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("a gated user landing on /views/chat is redirected to the age gate", async () => {
    const page = await ctx.openPage();
    await login(page, ctx,);
    const errors = trackPageErrors(page, { allowlist: NOISE_ALLOWLIST, },);

    try {
      await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);

      // waitForURL on a looping guard never resolves → this test times out here.
      await page.waitForURL((url,) => url.pathname === "/views/age-gate", { timeout: 15_000, },);
      await page.locator("[data-testid='age-gate']",).waitFor({ state: "visible", timeout: 15_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("NO LOOP: the gate screen does not bounce itself", async () => {
    const page = await ctx.openPage();
    await login(page, ctx,);
    const errors = trackPageErrors(page, { allowlist: NOISE_ALLOWLIST, },);

    try {
      await page.goto(`${ctx.url}/views/age-gate`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='age-gate']",).waitFor({ state: "visible", timeout: 15_000, },);

      // Settle window: a self-bounce would move us off this URL within it.
      await page.waitForTimeout(2_000,);

      expect(new URL(page.url(),).pathname,).toBe("/views/age-gate",);
      await page.locator("[data-testid='age-gate-submit']",).waitFor({ state: "visible", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("full journey: gated → redirected → accept → unblocked", async () => {
    const page = await ctx.openPage();
    await login(page, ctx,);
    const errors = trackPageErrors(page, { allowlist: NOISE_ALLOWLIST, },);

    try {
      // 1. Land in the app while gated.
      await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.waitForURL((url,) => url.pathname === "/views/age-gate", { timeout: 15_000, },);

      // 2. Submit stays disabled until a date AND consent both exist.
      const submit = page.locator("[data-testid='age-gate-submit']",);
      await waitForDisabled(submit, true,);

      // 3. Fill the form. `type=date` needs a fillable ISO value.
      await page.fill("[data-testid='age-gate-birthdate']", "1990-01-01",);
      await page.locator("input[name='consent']",).check();
      await waitForDisabled(submit, false,);

      // 4. Submit → accepted → unblocked into the app.
      await page.click("[data-testid='age-gate-submit']",);
      await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 20_000, },);

      // 5. Settle: the guard must NOT re-redirect an accepted user.
      await page.waitForTimeout(2_000,);
      expect(new URL(page.url(),).pathname,).toBe("/views/chat",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 90_000,);

  test("an accepted user is never bounced back to the gate", async () => {
    const page = await ctx.openPage();
    await login(page, ctx,);
    const errors = trackPageErrors(page, { allowlist: NOISE_ALLOWLIST, },);

    try {
      // Accept out-of-band so this isolates the post-accept steady state.
      // Navigating to a stable page first: `evaluate` dies if the guard
      // redirects mid-call ("Execution context was destroyed").
      await page.goto(`${ctx.url}/views/age-gate`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.waitForURL((url,) => url.pathname === "/views/age-gate", { timeout: 15_000, },);
      await page.waitForTimeout(1_000,);

      // Accept out-of-band so this isolates the post-accept steady state.
      // The X-CSRF-Token header is the double-submit half (src/middleware/csrf.ts);
      // a raw fetch without it 403s — as it should.
      const accepted = await page.evaluate(async () => {
        const csrfCookie = document.cookie
          .split(";",)
          .map((c,) => c.trim())
          .find((c,) => c.startsWith("csrf_token=",));

        const csrf = csrfCookie === undefined ? undefined : csrfCookie.slice("csrf_token=".length,);
        const res = await fetch("/api/v1/age-gate/accept", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf,), } : {}),
          },
          body: JSON.stringify({ birthDate: "1990-01-01", },),
        },);

        return res.ok;
      },);

      expect(accepted,).toBe(true,);

      await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.waitForTimeout(2_000,);
      expect(new URL(page.url(),).pathname,).toBe("/views/chat",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});

describe("Age gate guard E2E — gate DISABLED", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({
      auth: { required: true, },
      ageGate: { enabled: false, minimumAge: 18, mode: "none", },
    },);

    await seedUsers(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("a user landing on /views/chat is NOT redirected when the gate is off", async () => {
    const page = await ctx.openPage();
    await login(page, ctx,);
    const errors = trackPageErrors(page, { allowlist: NOISE_ALLOWLIST, },);

    try {
      await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.waitForTimeout(2_000,);

      expect(new URL(page.url(),).pathname,).toBe("/views/chat",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("visiting the gate screen while disabled bounces to the app, once", async () => {
    const page = await ctx.openPage();
    await login(page, ctx,);
    const errors = trackPageErrors(page, { allowlist: NOISE_ALLOWLIST, },);

    try {
      await page.goto(`${ctx.url}/views/age-gate`, { waitUntil: "domcontentloaded", timeout: 30_000, },);

      // The screen's own init bounces a disabled-gate visitor to /views/chat.
      await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 15_000, },);

      // Settle: must land and STAY — a guard bounce here would be a loop.
      await page.waitForTimeout(2_000,);
      expect(new URL(page.url(),).pathname,).toBe("/views/chat",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
