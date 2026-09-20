// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Chat List View
 *
 * Verifies the /views/chat-list page:
 *  - header renders with new-chat CTA
 *  - grid loads via /dynamic/chats/list htmx and renders the seeded chat
 *  - search input narrows the grid by name via /dynamic/chats/search
 *  - type filter narrows the grid (hides direct chats when filtered to group)
 *
 * Pre-logs in via seeded data (demo/solo mode).
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

type TestPage = Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>;

describe("Chat list view E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    // Seed a second group chat so the type filter has something to hide.
    const groupId = `a000009a-0000-4000-a000-${"0".repeat(12,)}`;
    await ctx.db
      .insertInto("chats",)
      .values({
        id: groupId,
        name: "Other E2E Chat",
        type: "group",
        mode: "story",
        created_by: SEED.solo.id,
      },)
      .execute();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoChatList(page: TestPage,) {
    await page.goto(`${ctx.url}/views/chat-list`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='app-root']",).waitFor({ state: "attached", timeout: 30_000, },);
    await page.getByText(SEED.soloChat.name,).first().waitFor({ state: "attached", timeout: 30_000, },);
  }

  test("renders the chat list header with new-chat CTA and seeded chats", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChatList(page,);
      const newChat = page.locator("a[href='/views/new-chat']",).first();
      await newChat.waitFor({ state: "attached", timeout: 10_000, },);
      await page.getByText(SEED.soloChat.name,).first().waitFor({ state: "visible", timeout: 15_000, },);
      await page.getByText("Other E2E Chat",).first().waitFor({ state: "visible", timeout: 15_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("search narrows the grid to matching chats", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChatList(page,);
      await page.getByText(SEED.soloChat.name,).first().waitFor({ state: "visible", timeout: 15_000, },);
      await page.getByText("Other E2E Chat",).first().waitFor({ state: "visible", timeout: 15_000, },);

      await page.fill("#chat-search", "Other",);
      // "Other E2E Chat" is already visible pre-swap, so it is not a swap
      // signal. The observable contract is the non-matching chat detaching.
      await page.getByText(SEED.soloChat.name,).first().waitFor({ state: "detached", timeout: 15_000, },);
      const soloCount = await page.getByText(SEED.soloChat.name,).count();
      expect(soloCount, "search should filter out the non-matching chat",).toBe(0,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("type filter narrows the grid by chat type", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChatList(page,);
      await page.getByText(SEED.soloChat.name,).first().waitFor({ state: "visible", timeout: 15_000, },);
      await page.getByText("Other E2E Chat",).first().waitFor({ state: "visible", timeout: 15_000, },);

      await page.selectOption("#chat-type-filter", "direct",);
      // soloChat is already visible pre-swap; the swap signal is the group
      // chat detaching from the grid.
      await page.getByText("Other E2E Chat",).first().waitFor({ state: "detached", timeout: 15_000, },);
      const otherCount = await page.getByText("Other E2E Chat",).count();
      expect(otherCount, "group chat should be hidden by direct filter",).toBe(0,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
