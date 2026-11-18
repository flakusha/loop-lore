// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Admin -> Local Models tab - sd.cpp / ComfyUI discovery panels.
 *
 * Verifies:
 *  - both discovery sections render with empty states when no backend is configured
 *  - sdcpp-refresh / comfy-refresh issue the matching GET /api/v1/admin/sd-status/... request
 *
 * Logs in as the seeded admin (auth.required=true). Isolated per-file server + db.
 */

import type { Page, } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { AUTH_NOISE_ALLOWLIST, trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, seedUsers, } from "../../helpers/seed";

describe("Admin local models E2E", () => {
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

  async function openAdminPage() {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    try {
      if (!sessionReady) {
        await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
        await page.locator("[data-testid='login-submit']",).waitFor({ state: "visible", timeout: 30_000, },);
        await page.fill("[data-testid='username-input']", SEED.admin.username,);
        await page.fill("[data-testid='password-input']", SEED.admin.password,);
        const loginRes = page.waitForResponse(
          (res,) => res.url().includes("/api/v1/auth/login",) && res.request().method() === "POST",
          { timeout: 30_000, },
        );

        await page.click("[data-testid='login-submit']",);
        expect((await loginRes).status(),).toBe(200,);
        await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
        sessionReady = true;
      }

      await page.goto(`${ctx.url}/views/admin`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='admin-header']",).waitFor({ state: "visible", timeout: 15_000, },);
      return { page, errors, };
    } catch (error) {
      errors.detach();
      await page.close();
      throw error;
    }
  }

  async function openLocalModelsTab(page: Page,) {
    await page.click("[data-testid='admin-tab-local-models']",);
    await page.locator("[data-testid='local-models-sdcpp']",).waitFor({ state: "visible", timeout: 15_000, },);
    await page.locator("[data-testid='local-models-comfy']",).waitFor({ state: "visible", timeout: 15_000, },);
  }

  test("renders sd.cpp and ComfyUI panels with empty states when no backend is configured", async () => {
    const { page, errors, } = await openAdminPage();
    try {
      await openLocalModelsTab(page,);
      await page
        .locator("[data-testid='local-models-sdcpp'] .empty-state",)
        .waitFor({ state: "visible", timeout: 15_000, },);

      await page
        .locator("[data-testid='local-models-comfy'] .empty-state",)
        .waitFor({ state: "visible", timeout: 15_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("refresh buttons issue the matching sd-status discovery requests", async () => {
    const { page, errors, } = await openAdminPage();
    try {
      await openLocalModelsTab(page,);
      // The tab switch auto-loads both panels; wait for that first pass so the
      // waiters below observe only the explicit refresh requests.
      await page
        .locator("[data-testid='local-models-sdcpp'] .empty-state",)
        .waitFor({ state: "visible", timeout: 15_000, },);

      await page
        .locator("[data-testid='local-models-comfy'] .empty-state",)
        .waitFor({ state: "visible", timeout: 15_000, },);

      const sdReq = page.waitForRequest(
        (req,) => req.url().includes("/api/v1/admin/sd-status/sdcpp",) && req.method() === "GET",
        { timeout: 15_000, },
      );

      await page.click("[data-testid='sdcpp-refresh']",);
      expect((await sdReq).url(),).toContain("/api/v1/admin/sd-status/sdcpp",);

      const comfyReq = page.waitForRequest(
        (req,) => req.url().includes("/api/v1/admin/sd-status/comfyui",) && req.method() === "GET",
        { timeout: 15_000, },
      );

      await page.click("[data-testid='comfy-refresh']",);
      expect((await comfyReq).url(),).toContain("/api/v1/admin/sd-status/comfyui",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
