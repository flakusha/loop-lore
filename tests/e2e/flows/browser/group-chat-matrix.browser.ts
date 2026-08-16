// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Group-Chat Matrix UI (C1 — turn-order indicator + side-channels)
 *
 * Verifies the two group-chat matrix UI surfaces end-to-end in the browser:
 *  - Turn-order indicator: the participant panel renders an ordered list of
 *    AI participants with the strategy-selected "next" speaker marked.
 *  - Side-channels: the header dropdown lists child chats, creates a new
 *    side-channel, and switches the active chat to it.
 *
 * Drives the real UI (header buttons → Alpine store → REST) rather than calling
 * the API directly, so a regression in the window.* → Alpine this-binding or
 * the store sync is caught here.
 */
import { ChatMode, ChatType, } from "@/db/enums";
import type { DB, } from "@/db/schema";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { SEED, seedAll, } from "../../helpers/seed";

describe("Group-chat matrix UI (C1)", () => {
  let ctx: BrowserTestContext;
  let groupId: string;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await seedAll(ctx.db,);

    // Create a group chat owned by the solo user (the browser auto-logs-in as
    // the solo user) and add the solo AI character as a participant so turn
    // selection has a non-user candidate.
    const db: Kysely<DB> = ctx.db;
    groupId = crypto.randomUUID();
    await db
      .insertInto("chats",)
      .values({
        id: groupId,
        name: "Matrix Group",
        type: ChatType.Group,
        mode: ChatMode.Group,
        created_by: SEED.solo.id,
        turn_strategy: "round_robin",
      },)
      .execute();
    await db
      .insertInto("chat_participants",)
      .values({ chat_id: groupId, actor_id: SEED.solo.id, role_in_chat: "owner", },)
      .execute();
    await db
      .insertInto("chat_participants",)
      .values({ chat_id: groupId, actor_id: SEED.soloCharacter.id, role_in_chat: "member", },)
      .execute();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  /** Open the group chat directly and wait for the chat header. */
  async function openGroupChat(
    page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
  ) {
    await page.goto(`${ctx.url}/views/chat?chatid=${groupId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    },);
    await page.locator("[data-testid='chat-header']",).waitFor({ state: "attached", timeout: 30_000, },);
    await page.waitForFunction(
      (gid,) => location.search.includes(`chatid=${gid}`,),
      groupId,
      { timeout: 10_000, },
    );
  }

  /** Open the participant panel (turn-order indicator) via the header toggle. */
  async function openParticipantPanel(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.evaluate(() => {
      document.querySelector("[data-testid='participant-toggle']",)?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, },),
      );
    },);
    await page.locator("[data-testid='participant-panel']",).waitFor({ state: "visible", timeout: 10_000, },);
  }

  test("turn-order indicator renders the AI companion as the next speaker", async () => {
    const page = await ctx.openPage();
    try {
      await openGroupChat(page,);
      await openParticipantPanel(page,);

      const slots = page.locator("[data-testid='turn-order-slot']",);
      await slots.first().waitFor({ state: "attached", timeout: 10_000, },);
      const count = await slots.count();
      expect(count,).toBeGreaterThan(0,);

      // The seeded AI character is in the order with the "next" badge.
      const companionSlot = slots.filter({ hasText: SEED.soloCharacter.name, },);
      await companionSlot.waitFor({ state: "attached", timeout: 10_000, },);
      const nextBadge = companionSlot.locator(".badge-next",);
      await nextBadge.waitFor({ state: "visible", timeout: 10_000, },);
      const badgeText = await nextBadge.textContent();
      expect(badgeText?.trim(),).toBe("next",);
    } finally {
      await page.close();
    }
  }, 60_000,);

  test("side-channels dropdown lists channels and opens them", async () => {
    const page = await ctx.openPage();
    try {
      await openGroupChat(page,);

      // Open the side-channels dropdown.
      await page.evaluate(() => {
        document.querySelector("[data-testid='side-channels-toggle']",)?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, },),
        );
      },);
      const menu = page.locator("[data-testid='side-channels-menu']",);
      await menu.waitFor({ state: "visible", timeout: 10_000, },);
      // No side-channels seeded → empty state shown.
      await menu.locator("[data-testid='side-channel-empty']",).waitFor({ state: "visible", timeout: 10_000, },);

      // Create a side-channel via the dropdown form.
      await page.fill("[data-testid='side-channel-name-input']", "OOC Thread",);
      await page.evaluate(() => {
        document.querySelector("[data-testid='side-channel-create-btn']",)?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, },),
        );
      },);

      // The new side-channel appears in the list and the app switches to it
      // (URL changes to the new chat id — avoids serializing the full Alpine
      // state, whose `filteredAvailableActors` getter throws pre-init).
      const row = page.locator("[data-testid='side-channel-row']",).filter({ hasText: "OOC Thread", },);
      await row.waitFor({ state: "attached", timeout: 15_000, },);
      await page.waitForFunction(
        (gid,) => location.search.includes(`chatid=`,) && location.search.includes(`chatid=${gid}`,) === false,
        groupId,
        { timeout: 15_000, },
      );
    } finally {
      await page.close();
    }
  }, 60_000,);
});
