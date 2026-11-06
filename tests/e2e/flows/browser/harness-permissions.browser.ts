// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: the Harness tab's pending-permission queue — a refused
 * decision must NOT hide the parked asks.
 *
 * The harness APIs are stubbed at the network edge: the queue serves one
 * parked ask and every decision POST fails with a 500. The panel has to keep
 * listing the ask (the operator has to see it to retry) and report the
 * failure in its own banner.
 *
 * Isolated per-file server + browser (admin-dashboard-populated.browser.ts
 * convention).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { AUTH_NOISE_ALLOWLIST, trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, seedUsers, } from "../../helpers/seed";

/** One parked ask, as the queue serves it. */
const ASK = {
  id: "ask-1",
  profile: "omp-main",
  tool: "write",
  input: { path: "notes.md", },
  cwd: "/srv/project",
  arrival: 1_700_000_000_000,
};

/** The real body shape: every JSON response carries the meta envelope. */
const QUEUE_BODY = { meta: { api_version: "1", }, items: [ASK,], };

/** Log in as the seeded admin and open the admin view. */
async function loginAsAdmin(ctx: BrowserTestContext,) {
  const page = await ctx.openPage();
  const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
  try {
    await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.waitForSelector("[data-testid='login-submit']", { timeout: 10_000, },);
    await page.fill("[data-testid='username-input']", SEED.admin.username,);
    await page.fill("[data-testid='password-input']", SEED.admin.password,);
    // Arm the waiter before the click: attaching it afterwards races the
    // htmx POST and degenerates into a guaranteed timeout under load.
    const loginRes = page.waitForResponse(
      (res: import("playwright").Response,) =>
        res.url().includes("/api/v1/auth/login",) && res.request().method() === "POST",
      { timeout: 30_000, },
    );

    await page.click("[data-testid='login-submit']",);
    await loginRes;
    await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
    await page.goto(`${ctx.url}/views/admin`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.waitForSelector("[data-testid='admin-header']", { timeout: 15_000, },);
    return { page, errors, };
  } catch (error) {
    await page.close();
    throw error;
  }
}

describe("Harness tab — pending permission queue", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, }, },);
    await seedUsers(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("a refused decision keeps the parked ask listed and reports the failure", async () => {
    const { page, errors, } = await loginAsAdmin(ctx,);
    try {
      // The queue serves one ask; every decision is refused.
      const decisions: string[] = [];
      await page.route("**/api/v1/harness/permissions**", async (route,) => {
        if (route.request().method() === "POST") {
          const request = route.request();
          const method = request.method();
          const path = new URL(request.url(),).pathname;
          decisions.push(`${method} ${path}`,);
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "no live connection", },),
          },);

          return;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(QUEUE_BODY,),
        },);
      },);

      // The neighbouring panels answer too, so the tab content renders at all.
      await page.route("**/api/v1/harness/runs**", async (route,) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ meta: { api_version: "1", }, items: [], },),
        },);
      },);

      await page.route("**/api/v1/harness/stats", async (route,) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}", },);
      },);

      await page.route("**/api/v1/harness/settings", async (route,) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ enabled: false, profiles: [], },),
        },);
      },);

      await page.click("[data-testid='admin-tab-harness']",);
      const row = page.locator("[data-testid='harness-permission-row']",);
      await row.waitFor({ state: "visible", timeout: 15_000, },);
      expect(await row.innerText(),).toContain("omp-main",);

      // The decision is refused: the ask is still parked, so the table keeps
      // listing it and only the failure is reported.
      await page.click("[data-testid='harness-permission-approve']",);
      const failure = page.locator("[data-testid='harness-permissions-decision-error']",);
      await failure.waitFor({ state: "visible", timeout: 15_000, },);

      expect(await row.isVisible(),).toBe(true,);
      expect(await page.locator("[data-testid='harness-permissions-error']",).isVisible(),).toBe(false,);
      expect(await failure.innerText(),).toContain("Could not record the decision.",);

      // The decision must go out as a POST: the route is POST-only, so a GET
      // would 404 and the ask would stay parked forever.
      expect(decisions,).toEqual(["POST /api/v1/harness/permissions/ask-1/approve",],);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
