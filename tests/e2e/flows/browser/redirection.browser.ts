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

const ROUTES = {
  root: "/",
  chatHtml: "/views/chat.html",
  unknownView: "/views/does-not-exist",
  shortChat: "/chat",
  chat: "/views/chat",
  login: "/views/login",
  viewsRoot: "/views/",
} as const;

async function redirectPath(ctx: BrowserTestContext, path: string, expected: string,): Promise<void> {
  const page = await ctx.openPage();
  try {
    await page.goto(`${ctx.url}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.waitForURL((url,) => url.pathname === expected, { timeout: 30_000, },);
  } finally {
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

  test("unknown '/views/does-not-exist' redirects to '/views/'", async () => {
    await redirectPath(ctx, ROUTES.unknownView, ROUTES.viewsRoot,);
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
      await page.close();
    }
  }, 60_000,);
});
