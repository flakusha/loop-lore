// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Redirection Behavior
 *
 * Verifies app-level and view-level redirects:
 *  - solo mode (auth NOT required): "/" → /views/chat, clean-path redirects
 *    for /views/chat.html, unknown /views/* → /views/, and "/chat" → /views/chat
 *  - auth.required=true (no login): "/" → /views/login and direct /views/chat
 *    must NOT render chat content (redirect to login or no chat DOM).
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { AUTH_NOISE_ALLOWLIST, trackPageErrors, } from "../../helpers/htmx-alpine";

const ROUTES = {
  root: "/",
  chatHtml: "/views/chat.html",
  unknownView: "/views/does-not-exist",
  shortChat: "/chat",
  chat: "/views/chat",
  login: "/views/login",
  viewsRoot: "/views/",
} as const;

async function redirectPath(
  ctx: BrowserTestContext,
  path: string,
  expected: string,
): Promise<void> {
  const page = await ctx.openPage();
  const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
  try {
    await page.goto(`${ctx.url}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.waitForURL((url,) => url.pathname === expected, { timeout: 30_000, },);
  } finally {
    errors.assert();
    errors.detach();
    await page.close();
  }
}

/**
 * Verify a 302 redirect without following it. The destination may not be a
 * renderable page (e.g. `/views/` is an index route that 404s in this app and
 * Chromium would treat the body as a download, so `page.goto` would error).
 * Inspecting the raw response header is the right tool here.
 */
async function assertRedirect(
  ctx: BrowserTestContext,
  path: string,
  expectedLocation: string,
): Promise<void> {
  const page = await ctx.openPage();
  const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
  try {
    const res = await page.context().request.get(`${ctx.url}${path}`, { maxRedirects: 0, },);
    expect(res.status(),).toBe(302,);
    expect(new URL(res.headers().location ?? "", ctx.url,).pathname,).toBe(expectedLocation,);
  } finally {
    errors.assert();
    errors.detach();
    await page.close();
  }
}

describe("Redirection E2E — solo mode", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("GET '/' redirects to '/views/chat'", async () => {
    await redirectPath(ctx, ROUTES.root, ROUTES.chat,);
  }, 60_000,);

  test("'/views/chat.html' redirects to clean '/views/chat' path", async () => {
    await redirectPath(ctx, ROUTES.chatHtml, ROUTES.chat,);
  }, 60_000,);

  test("unknown '/views/does-not-exist' 302s to '/views/'", async () => {
    // /views/ itself returns a 404 binary body in this app, which Chromium
    // would treat as a download; assert the 302 without following it.
    await assertRedirect(ctx, ROUTES.unknownView, ROUTES.viewsRoot,);
  }, 60_000,);

  test("'/chat' redirects to '/views/chat'", async () => {
    await redirectPath(ctx, ROUTES.shortChat, ROUTES.chat,);
  }, 60_000,);
});

describe("Redirection E2E — auth required", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, }, },);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("GET '/' redirects to '/views/login' when unauthenticated", async () => {
    await redirectPath(ctx, ROUTES.root, ROUTES.login,);
  }, 60_000,);

  test("direct '/views/chat' without login does not show chat content", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    try {
      await page.goto(`${ctx.url}${ROUTES.chat}`, { waitUntil: "domcontentloaded", timeout: 30_000, },);

      // Accept either resolution: the app bounces to /views/login, or it stays
      // put but never renders the chat message list. Either way chat content
      // must NOT be shown.
      let redirected = false;
      try {
        await page.waitForURL((url,) => url.pathname === ROUTES.login, { timeout: 15_000, },);
        redirected = true;
      } catch { /* stayed on the chat URL */ }

      if (redirected) {
        expect(new URL(page.url(),).pathname,).toBe(ROUTES.login,);
        return;
      }

      // Not redirected: assert chat content never renders in a short window.
      let messageListVisible = false;
      try {
        await page.locator("[data-testid='message-list']",).waitFor({ state: "visible", timeout: 2000, },);
        messageListVisible = true;
      } catch { /* never became visible */ }
      expect(messageListVisible,).toBe(false,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  // ── Regression guard (TASK-PLAN-E2E-STABILIZATION, TASK-e2e-auth-flows Topic 8) ──
  // The auth-redirect loop: when the app fires a background request that
  // returns 401 while the user is already on /views/login, the 401 handler
  // used to re-encode the current URL (including any prior ?redirect=) into
  // a new ?redirect= param, producing a runaway chain. The fix in
  // src/frontend/fe-fetch.ts short-circuits the handler when already on
  // /views/login or /views/register. This test exercises that path and
  // asserts the URL stays stable across multiple 401s.
  test("no growing ?redirect= chain on /views/login after repeated 401s", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    try {
      await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='login-submit']",).waitFor({ state: "visible", timeout: 15_000, },);

      const baseline = new URL(page.url(),).searchParams.get("redirect",);
      const baselineLen = baseline?.length ?? 0;

      // Trigger the 401 handler path multiple times by hitting an auth-required
      // endpoint with a deliberately bad/missing cookie. Each call would have
      // previously appended a nested ?redirect= entry, growing the param.
      for (let i = 0; i < 5; i++) {
        await page.evaluate(async () => {
          await fetch("/api/auth/me", { credentials: "include", },);
        },);
      }
      // Let any post-401 microtasks settle.
      await page.waitForTimeout(200,);

      const after = new URL(page.url(),).searchParams.get("redirect",);
      const afterLen = after?.length ?? 0;
      // The fix must prevent growth: same length (or zero) as the baseline.
      expect(afterLen,).toBe(baselineLen,);
      // And we must still be on /views/login (no auto-bounce).
      expect(new URL(page.url(),).pathname,).toBe(ROUTES.login,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
