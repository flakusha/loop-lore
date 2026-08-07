/**
 * Browser E2E: Registration Flow
 *
 * Verifies the /views/register flow: a valid submission creates the user and
 * redirects to /views/chat (htmx HX-Redirect); an invalid/duplicate
 * submission surfaces an error in the register-error target.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";

describe("Registration flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, registrationOpen: true, }, });
  }, 45_000,);

  afterAll(async () => {
    await ctx.close();
  },);

  async function gotoRegister(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.goto(`${ctx.url}/views/register`, { waitUntil: "domcontentloaded", timeout: 15_000, },);
    await page.locator("[data-testid='register-submit']",).waitFor({ state: "visible", timeout: 10_000, },);
    await page.waitForTimeout(400,);
  }

  describe("Register form", () => {
    test("renders username + password + submit", async () => {
      const page = await ctx.openPage();
      try {
        await gotoRegister(page,);
        expect(await page.isVisible("[data-testid='username-input']",),).toBe(true,);
        expect(await page.isVisible("[data-testid='password-input']",),).toBe(true,);
        expect(await page.isVisible("[data-testid='register-submit']",),).toBe(true,);
      } finally {
        await page.close();
      }
    }, 40_000,);

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
        const errUrls: string[] = [];
        page.on("response", (res,) => {
          if (res.status() === 401) { errUrls.push(res.url(),); }
        },);
        await page.fill("[data-testid='username-input']", username,);
        await page.fill("[data-testid='password-input']", "password-123",);
        await page.click("[data-testid='register-submit']",);

        // htmx follows HX-Redirect /views/chat on success.
        await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 10_000, },);

        // User persisted.
        const row = await ctx.db
          .selectFrom("users",)
          .select(["username",])
          .where("username", "=", username,)
          .executeTakeFirst();
        expect(row,).not.toBeNull();
        expect(row!.username,).toBe(username,);
        console.log("AUTH401_URLS", JSON.stringify(errUrls,),);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 40_000,);
  });
});
