// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Admin dashboard (populated) — provider health telemetry +
 * fine-tuning panels render from real seeded data.
 *
 * Logs in as an admin and verifies:
 *  - Health tab → "Generation Telemetry (AUX)" aggregates + recent-calls list
 *  - Models tab → "Fine-tuning" panel with base-model candidates + "automated
 *    training not wired" status
 *
 * Isolated per-file server + browser (auth-flow.browser.ts convention).
 */

import { afterAll, beforeAll, describe, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { SEED, seedUsers, } from "../../helpers/seed";

const U = "00000000-0000-4000-a000-000000000000";

async function loginAsAdmin(ctx: BrowserTestContext,) {
  const page = await ctx.openPage();
  await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
  await page.waitForSelector("[data-testid='login-submit']", { timeout: 10_000, },);
  await page.fill("[data-testid='username-input']", SEED.admin.username,);
  await page.fill("[data-testid='password-input']", SEED.admin.password,);
  await page.click("[data-testid='login-submit']",);
  await page.waitForTimeout(1200,);
  // Session is validated server-side: reaching the admin header proves auth.
  await page.goto(`${ctx.url}/views/admin`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
  await page.waitForSelector("[data-testid='admin-header']", { timeout: 15_000, },);
  return page;
}

/** Seed one AUX telemetry event + one model capability so panels populate. */
async function seedPopulatedData(db: BrowserTestContext["db"],) {
  await db
    .insertInto("telemetry_events",)
    .values({
      id: `c0000001-0000-4000-a000-${U.slice(24,)}`,
      event_type: "aux.call",
      event_data: JSON.stringify({
        task: "summarize",
        model: "test-8b",
        provider: "test-provider",
        latencyMs: 123,
        success: true,
        promptTokens: 10,
        completionTokens: 20,
      },),
      user_id: SEED.admin.id,
      created_at: new Date().toISOString(),
    },)
    .execute();
  await db
    .insertInto("model_capabilities",)
    .values({
      id: `c0000002-0000-4000-a000-${U.slice(24,)}`,
      provider_id: "test-provider",
      model_id: "test-8b",
      context_window: 128_000,
      param_size: "8B",
      modalities: JSON.stringify(["text",],),
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },)
    .execute();
}

describe("Admin dashboard panels — populated", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, }, },);
    await seedUsers(ctx.db,);
    await seedPopulatedData(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("health tab renders AUX telemetry aggregates and recent calls", async () => {
    const page = await loginAsAdmin(ctx,);
    await page.getByRole("button", { name: "Health", },).click();
    await page.waitForSelector("text=Generation Telemetry (AUX)", { timeout: 10_000, },);
    await page.waitForSelector("text=summarize", { timeout: 10_000, },);
    await page.waitForSelector("text=test-8b", { timeout: 10_000, },);
    await page.close();
  }, 60_000,);

  test("models tab renders fine-tuning panel with candidates and not-wired status", async () => {
    const page = await loginAsAdmin(ctx,);
    await page.getByRole("button", { name: "Models", },).click();
    await page.waitForSelector("text=Fine-tuning", { timeout: 10_000, },);
    await page.waitForSelector("text=automated training not wired", { timeout: 10_000, },);
    await page.waitForSelector("text=test-8b", { timeout: 10_000, },);
    await page.waitForSelector("text=128K", { timeout: 10_000, },);
    await page.close();
  }, 60_000,);
});
