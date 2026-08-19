// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Admin dashboard (empty) — B10 panels show their empty states
 * when no telemetry events or model capabilities exist.
 *
 * Isolated per-file server + browser (auth-flow.browser.ts convention).
 */

import { afterAll, beforeAll, describe, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { SEED, seedUsers, } from "../../helpers/seed";

async function loginAsAdmin(ctx: BrowserTestContext,) {
  const page = await ctx.openPage();
  await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
  await page.waitForSelector("[data-testid='login-submit']", { timeout: 10_000, },);
  await page.fill("[data-testid='username-input']", SEED.admin.username,);
  await page.fill("[data-testid='password-input']", SEED.admin.password,);
  await page.click("[data-testid='login-submit']",);
  await page.waitForTimeout(1200,);
  await page.goto(`${ctx.url}/views/admin`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
  await page.waitForSelector("[data-testid='admin-header']", { timeout: 15_000, },);
  return page;
}

describe("Admin dashboard panels — empty", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, }, },);
    await seedUsers(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("health and models tabs show empty states when no data exists", async () => {
    const page = await loginAsAdmin(ctx,);
    await page.getByRole("button", { name: "Health", },).click();
    await page.waitForSelector("text=No AUX generation calls recorded yet", { timeout: 10_000, },);
    await page.getByRole("button", { name: "Models", },).click();
    await page.waitForSelector("text=automated training not wired", { timeout: 10_000, },);
    await page.waitForSelector("text=No models discovered.", { timeout: 10_000, },);
    await page.close();
  }, 90_000,);
});
