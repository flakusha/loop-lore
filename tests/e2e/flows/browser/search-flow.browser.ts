// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Search & Filtering
 *
 * Verifies the gallery filter-bar search narrows the grid via the
 * /dynamic/gallery/search endpoint. Two seeded assets with distinct filenames;
 * searching for one must show only its card.
 */

import { ChatMode, ChatType, } from "@/db/enums";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import {
  getAlpineData,
  trackPageErrors,
  waitForAlpineState,
} from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

describe("Search & filtering E2E", () => {
  let ctx: BrowserTestContext;
  const assetA = `a1000001-0000-4000-a000-000000000000`;
  const assetB = `a1000002-0000-4000-a000-000000000000`;
  const fileNameA = "bright-orange-book.png";
  const fileNameB = "mossy-stone-wall.png";

  beforeAll(async () => {
    ctx = await createBrowserTest();
    for (const [id, name,] of [[assetA, fileNameA,], [assetB, fileNameB,],] as const) {
      await ctx.db
        .insertInto("assets",)
        .values({
          id,
          owner_id: SEED.solo.id,
          filename: name,
          mime_type: "image/png",
          asset_type: "image",
          size_bytes: 10,
          storage_path: `/tmp/test-${id}.png`,
          storage_backend: "local",
        },)
        .onConflict((oc,) => oc.column("id",).doNothing())
        .execute();
    }
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoGallery(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.goto(`${ctx.url}/views/gallery`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='gallery-header']",).waitFor({ state: "attached", timeout: 30_000, },);
  }

  describe("Gallery search", () => {
    test("filtering by filename narrows the grid to matching assets", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, {
        // Seed assets reference synthetic storage files that don't exist, so
        // their /api/v1/assets/:id/thumb requests 404. This is test-data noise,
        // not an app regression.
        allowlist: [
          /\bFailed to load resource: the server responded with a status of 404 \(Not Found\)/,
          // /api/v1/telemetry/event returns 403 for solo (not an admin) — benign.
          /Failed to load resource.*403/,
        ],
      },);
      try {
        await gotoGallery(page,);

        // Wait for grid to load both seeded assets.
        await page.locator(`[data-testid='asset-card-${assetA}']`,).waitFor({ timeout: 30_000, },);
        await page.locator(`[data-testid='asset-card-${assetB}']`,).waitFor({ timeout: 30_000, },);

        // Type a query matching only asset A; filter-bar debounces + searches.
        await page.fill(".list-search", "bright-orange",);
        await page.waitForTimeout(700,);

        // asset A card remains; asset B card is gone from the grid.
        await page.locator(`[data-testid='asset-card-${assetA}']`,).waitFor({ timeout: 30_000, },);
        const bCount = await page.locator(`[data-testid='asset-card-${assetB}']`,).count();
        expect(bCount,).toBe(0,);

        // Clearing the query restores both.
        await page.fill(".list-search", "",);
        await page.waitForTimeout(700,);
        await page.locator(`[data-testid='asset-card-${assetB}']`,).waitFor({ timeout: 30_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);
  });

  // ── Chat-list filter ─────────────────────────────────────────────────────────
  //
  // Reuses the solo seed: SEED.soloChat is created by createBrowserTest's
  // seedSolo() — no separate createBrowserTest or chat inserts required.
  describe("Search & filtering E2E > Chat-list search", () => {
    let ctx: BrowserTestContext;

    beforeAll(async () => {
      ctx = await createBrowserTest();
    }, 90_000,);

    afterAll(async () => {
      await ctx?.close();
    },);

    test("chat-list-search input narrows filteredChats to matching entries", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, {
        allowlist: [/Failed to load resource.*403/, /Failed to load resource.*404/,],
      },);
      try {
        // Wait for chatState.init() → loadChats() to populate the seeded solo chat.
        await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
        await waitForAlpineState(
          page,
          "[x-data='chatState()']",
          (state,) =>
            Array.isArray(state.chats,) &&
            (state.chats as { name: string }[]).some(
              (c,) => c.name === SEED.soloChat.name,
            ),
          15_000,
        );

        // Open the chat-list panel.
        await page.evaluate(() => {
          document.querySelector("[data-testid='toggle-chat-list']",)?.dispatchEvent(
            new MouseEvent("click", { bubbles: true, },),
          );
        },);
        await page.locator(".chat-list-search",).waitFor({ state: "attached", timeout: 10_000, },);

        // Filter on a query that DOES NOT match — filteredChats should be empty.
        await page.fill(".chat-list-search", "no-such-chat-xyzzy",);
        await page.waitForTimeout(300,);
        const empty = await getAlpineData<Record<string, unknown>>(page, "[x-data='chatState()']",);
        expect(empty.filteredChats as unknown[],).toEqual([],);

        // Filter on a partial query that matches the seeded solo chat.
        const partial = SEED.soloChat.name.split(" ",)[0] ?? SEED.soloChat.name;
        await page.fill(".chat-list-search", partial,);
        await page.waitForTimeout(300,);
        const filled = await getAlpineData<Record<string, unknown>>(page, "[x-data='chatState()']",);
        const names = (filled.filteredChats as { name: string }[]).map((c,) => c.name);
        expect(names,).toContain(SEED.soloChat.name,);

        // Clearing restores the full list.
        await page.fill(".chat-list-search", "",);
        await page.waitForTimeout(300,);
        const cleared = await getAlpineData<Record<string, unknown>>(page, "[x-data='chatState()']",);
        const clearedNames = (cleared.chats as { name: string }[]).map((c,) => c.name);
        expect(clearedNames,).toContain(SEED.soloChat.name,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);
  });

  // ── In-chat message search (FTS5) ───────────────────────────────────────────
  //
  // Uses the seeded solo chat — direct DB insert of two messages into it, then
  // navigate via /views/chat?chatid=... so selectChat() runs on the right chat.
  describe("Search & filtering E2E > In-chat message search (FTS5)", () => {
    let ctx: BrowserTestContext;

    const needle = `needle${Date.now()}`;
    const distractor = `distractor${Date.now()}`;
    const matchMsgId = "d3333331-0000-4000-a000-000000000099";
    const distractorMsgId = "d3333332-0000-4000-a000-000000000099";

    beforeAll(async () => {
      ctx = await createBrowserTest();
      await ctx.db
        .insertInto("messages",)
        .values([
          {
            id: matchMsgId,
            chat_id: SEED.soloChat.id,
            actor_id: SEED.solo.id,
            role: "user",
            // FTS indexes content_plaintext (trigger on AFTER INSERT), not
            // content — mirror the POST path (storedPlaintext) here.
            content: `${needle} alpha`,
            content_plaintext: `${needle} alpha`,
            content_format: "markdown",
            content_type: "text",
            content_encoding: "identity",
            status: "confirmed",
            visibility: "visible",
          },
          {
            id: distractorMsgId,
            chat_id: SEED.soloChat.id,
            actor_id: SEED.solo.id,
            role: "user",
            content: distractor,
            content_plaintext: distractor,
            content_format: "markdown",
            content_type: "text",
            content_encoding: "identity",
            status: "confirmed",
            visibility: "visible",
          },
        ],)
        .execute();
    }, 90_000,);

    afterAll(async () => {
      await ctx?.close();
    },);

    test("FTS5 /api/v1/messages/search scopes results to the active chat", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, {
        allowlist: [/Failed to load resource.*403/, /Failed to load resource.*404/,],
      },);
      try {
        // Open the seeded chat via the URL parameter so activeChat is set.
        await page.goto(`${ctx.url}/views/chat?chatid=${SEED.soloChat.id}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        },);
        await waitForAlpineState(
          page,
          "[x-data='chatState()']",
          (state,) => state.activeChat === SEED.soloChat.id,
          15_000,
        );

        // Open the message search bar and run the query.
        await page.evaluate(
          () => (globalThis as { toggleMessageSearch?: () => void }).toggleMessageSearch?.(),
        );
        const searchInput = page.locator("[data-testid='message-search-input']",);
        await searchInput.waitFor({ state: "attached", timeout: 5_000, },);
        await searchInput.fill(needle,);

        // Wait for the FTS query to populate the match list.
        await waitForAlpineState(
          page,
          "[x-data='chatState()']",
          (state,) =>
            state.activeChat === SEED.soloChat.id &&
            Array.isArray(state._msgSearchMatches,) &&
            (state._msgSearchMatches as string[]).includes(matchMsgId,),
          10_000,
        );

        const state = await getAlpineData<Record<string, unknown>>(page, "[x-data='chatState()']",);
        const matches = state._msgSearchMatches as string[];
        expect(matches,).toContain(matchMsgId,);
        expect(matches,).not.toContain(distractorMsgId,);
        expect(state._msgSearchTotal,).toBeGreaterThan(0,);

        // Highlight class applied to the matching bubble.
        const highlighted = await page.locator("#message-list .search-match",).count();
        expect(highlighted,).toBeGreaterThan(0,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);
  });
});
