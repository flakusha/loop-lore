// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: htmx → egui → htmx transfer
 *
 * Walks the full transfer round-trip across the two frontends:
 *  - chat page → click `open-in-egui` → the bridge writes the browser-side
 *    context (`loop-lore.egui-context.v1`) and lands on /egui;
 *  - /egui renders canvas + status line + back button and the context holds
 *    the active chat id and the return path;
 *  - click `egui-back-to-htmx` → back on /views/chat?chatid=<id> with the
 *    context still stored.
 *
 * The wasm bundle is not compiled in the test env, so /egui/app.js and
 * /egui/app.wasm 404 by design: the transfer contract (URL, DOM, context),
 * not canvas paint, is what gets asserted. See .tmp/egui-contract.md.
 */

import type { Page, } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import {
  EXPECTED_404_NOISE_ALLOWLIST,
  trackPageErrors,
  waitForAlpineReady,
  waitForAlpineState,
} from "../../helpers/htmx-alpine";
import { SEED, seedAll, } from "../../helpers/seed";

/** Browser-side transfer context key shared by the htmx bridge and /egui. */
const CONTEXT_KEY = "loop-lore.egui-context.v1";

/** The egui wasm bundle is absent in the test env — 404s for it are expected. */
const MISSING_ASSET_NOISE: readonly RegExp[] = [/\/egui\/app\.(js|wasm)/,];

/** Shape of the stored transfer context (see .tmp/egui-contract.md). */
type EguiContext = {
  version: number;
  activeChatId: string | null;
  returnTo: string;
};

/**
 * @param page - the browser page
 * @returns the stored transfer context, or null when the key is absent
 */
async function readContext(page: Page,): Promise<EguiContext | null> {
  const raw = await page.evaluate(() => localStorage.getItem(CONTEXT_KEY,));
  return raw === null ? null : (JSON.parse(raw,) as EguiContext);
}

describe("htmx ↔ egui transfer E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await seedAll(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("chat → open-in-egui → back-to-htmx round-trips the chat context", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, {
      allowlist: [...EXPECTED_404_NOISE_ALLOWLIST, ...MISSING_ASSET_NOISE,],
    },);

    try {
      // ── htmx side: select the seeded chat so the URL carries chatid ──
      await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='message-list']",).waitFor({ state: "attached", timeout: 30_000, },);
      await waitForAlpineReady(page,);
      await page.locator("[data-testid='toggle-chat-list']",).click();
      const chatLink = page.locator("#chat-list .nav-item",).filter({ hasText: SEED.soloChat.name, },).first();
      await chatLink.waitFor({ state: "visible", timeout: 15_000, },);
      await chatLink.click();
      await waitForAlpineState(
        page,
        "[x-data='chatState()']",
        (state,) => state.activeChat === SEED.soloChat.id,
        10_000,
      );

      await page.waitForURL((url,) => url.searchParams.get("chatid",) === SEED.soloChat.id, { timeout: 15_000, },);

      // ── handoff: the bridge writes the context and navigates to /egui ──
      await page.locator("[data-testid='open-in-egui']",).click();
      await page.waitForURL((url,) => url.pathname === "/egui", { timeout: 30_000, },);

      // The host page renders even without the wasm bundle: canvas, status
      // line and back button are all static markup.
      await page.locator("#egui-canvas",).waitFor({ state: "visible", timeout: 15_000, },);
      const status = await page.locator("#egui-status",).textContent();
      expect(status,).toMatch(/egui/,);
      await page.locator("[data-testid='egui-back-to-htmx']",).waitFor({ state: "visible", timeout: 15_000, },);

      const context = await readContext(page,);
      expect(context,).not.toBeNull();
      expect(context!.version,).toBe(1,);
      expect(context!.activeChatId,).toBe(SEED.soloChat.id,);
      expect(context!.returnTo,).toBe(`/views/chat?chatid=${SEED.soloChat.id}`,);

      // ── return: back button re-writes the context and assigns returnTo ──
      await page.locator("[data-testid='egui-back-to-htmx']",).click();
      await page.waitForURL(
        (url,) => url.pathname === "/views/chat" && url.searchParams.get("chatid",) === SEED.soloChat.id,
        { timeout: 30_000, },
      );

      const returned = await readContext(page,);
      expect(returned,).not.toBeNull();
      expect(returned!.version,).toBe(1,);
      expect(returned!.activeChatId,).toBe(SEED.soloChat.id,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 90_000,);
});
