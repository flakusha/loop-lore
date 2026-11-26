// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: New chat - llm_only validation-harness variant.
 *
 * Verifies:
 *  - selecting llm_only reveals the validation-harness form group
 *  - the typed harness value is carried in the create POST body's
 *    gmConfig.validation.harness (request interception follows
 *    new-chat-advanced-fields.browser.ts)
 *
 * Logs in as the seeded user (auth.required=true). Isolated per-file server + db.
 */

import type { Page, } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { AUTH_NOISE_ALLOWLIST, trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, seedUsers, } from "../../helpers/seed";

describe("New chat harness variant E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, }, },);
    await seedUsers(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  /** One login per file: the auth endpoint is rate limited per server process. */
  let sessionReady = false;

  async function login(page: Page,) {
    if (sessionReady) { return; }
    await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='login-submit']",).waitFor({ state: "visible", timeout: 30_000, },);
    await page.fill("[data-testid='username-input']", SEED.user.username,);
    await page.fill("[data-testid='password-input']", SEED.user.password,);
    const loginRes = page.waitForResponse(
      (res,) => res.url().includes("/api/v1/auth/login",) && res.request().method() === "POST",
      { timeout: 30_000, },
    );

    await page.click("[data-testid='login-submit']",);
    expect((await loginRes).status(),).toBe(200,);
    await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
    sessionReady = true;
  }

  test("llm_only reveals the harness group and pins its value on the create POST", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    try {
      await login(page,);
      await page.goto(`${ctx.url}/views/new-chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='create-chat-form']",).waitFor({ state: "attached", timeout: 30_000, },);

      const harnessGroup = page.locator("#validation-harness-group",);
      await page.locator("[data-testid='chat-variant']",).selectOption("llm_only",);
      await harnessGroup.waitFor({ state: "visible", timeout: 10_000, },);

      const harness = "stay in character and never break role";
      await page.locator("[data-testid='chat-validation-harness']",).fill(harness,);

      const createReq = page.waitForRequest(
        (req,) => req.url().includes("/api/v1/chats",) && req.method() === "POST",
        { timeout: 15_000, },
      );

      await page.fill("[data-testid='chat-name-input']", `Harness-Chat-${Date.now()}`,);
      await page.click("[data-testid='create-chat-btn']",);

      const body = (await createReq).postDataJSON() as {
        variant?: string;
        gmConfig?: { validation?: { harness?: string } };
      };

      expect(body.variant,).toBe("llm_only",);
      expect(body.gmConfig?.validation?.harness,).toBe(harness,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 90_000,);
});
