// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Chat Settings Save + Ownership Transfer (B5)
 *
 * Resource contract (parallel-safe by construction):
 *  - Creates its OWN chats, participants, and a second user/actor pair under
 *    fresh randomUUID ids in beforeAll; chat names are unique per run.
 *  - Writes only DB rows (harness transaction scope); creates no files or
 *    uploads; the per-file browser server is torn down in afterAll.
 *  - Passes alone and in any order relative to other browser files.
 *
 * Covered interactions (chat-settings-modal.html):
 *  - toggle-chat-settings opens the modal; changing Thinking Visibility and
 *    clicking settings-save-btn persists chats.thinking_visibility (PUT
 *    /api/v1/chats/:id); a reload + reopen shows the persisted value.
 *  - Ownership transfer: open-ownership-transfer → ownership-new-owner →
 *    ownership-transfer-submit (POST /chats/:id/transfer-ownership) moves
 *    the owner role to the selected participant in chat_participants.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, waitForAlpineReady, } from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

const ERROR_ALLOWLIST = [
  /404 \(Not Found\)/,
  /401 \(Unauthorized\)/,
  /Failed to load resource/,
];

describe("Chat settings save + ownership transfer (B5)", () => {
  let ctx: BrowserTestContext;
  let settingsChatId: string;
  let ownershipChatId: string;
  let newUserActorId: string;

  const runTag = crypto.randomUUID().slice(0, 8,);

  /** Open a chat and the settings modal via the header toggle. */
  async function openSettingsModal(
    page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
    chatId: string,
  ) {
    await page.goto(`${ctx.url}/views/chat?chatid=${chatId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    },);

    await page.locator("[data-testid='chat-header']",).waitFor({ state: "attached", timeout: 30_000, },);
    await waitForAlpineReady(page, 15_000,);
    await page.locator("[data-testid='toggle-chat-settings']",).click();
    await page.locator("[data-testid='chat-settings-modal']",).waitFor({ state: "visible", timeout: 10_000, },);
  }

  beforeAll(async () => {
    ctx = await createBrowserTest();

    settingsChatId = crypto.randomUUID();
    ownershipChatId = crypto.randomUUID();
    // App convention: a user's actor row shares the user's id (see SEED), and
    // transfer-ownership flips chats.created_by to the participant's actor id,
    // so the actor id must be the user id for the FK to hold.
    newUserActorId = crypto.randomUUID();

    for (const chatId of [settingsChatId, ownershipChatId,]) {
      await ctx.db
        .insertInto("chats",)
        .values({
          id: chatId,
          name: `Settings E2E ${chatId.slice(0, 8,)}`,
          type: "direct",
          mode: "direct",
          created_by: SEED.solo.id,
        },)
        .execute();

      await ctx.db
        .insertInto("chat_participants",)
        .values({ chat_id: chatId, actor_id: SEED.solo.id, role_in_chat: "owner", },)
        .execute();

      // Production create path seeds the creator's owners row (owners set
      // is the authority source) — mirror it so settings/transfer see solo.
      await ctx.db
        .insertInto("chat_owners",)
        .values({ chat_id: chatId, user_id: SEED.solo.id, },)
        .execute();
    }

    // Second user + actor (same id, per app convention), participant (member)
    // of the ownership chat only.
    const newUserId = newUserActorId;
    await ctx.db
      .insertInto("users",)
      .values({
        id: newUserId,
        username: `e2e-owner-${runTag}`,
        display_name: `E2E Owner Target ${runTag}`,
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();

    await ctx.db
      .insertInto("actors",)
      .values({
        id: newUserActorId,
        actor_type: "user",
        display_name: `E2E Owner Target ${runTag}`,
        user_id: newUserId,
        owner_id: newUserId,
        agent_type: "none",
        settings: "{}",
        import_spec: "raw",
      },)
      .execute();

    await ctx.db
      .insertInto("chat_participants",)
      .values({ chat_id: ownershipChatId, actor_id: newUserActorId, role_in_chat: "member", },)
      .execute();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("settings-save-btn persists thinking visibility across a reload", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: ERROR_ALLOWLIST, },);

    try {
      await openSettingsModal(page, settingsChatId,);

      // Change a field and save; wait for the PUT /api/v1/chats/:id round-trip.
      const putRes = page.waitForResponse(
        (res,) =>
          res.url().includes(`/api/v1/chats/${settingsChatId}`,) &&
          res.request().method() === "PUT" &&
          !res.url().includes("auto-translate",),
        { timeout: 30_000, },
      );

      await page.selectOption("[data-testid='settings-thinking-visibility']", "visible",);
      await page.locator("[data-testid='settings-save-btn']",).click();
      const res = await putRes;
      expect(res.status(),).toBe(200,);

      // Persisted in DB.
      const row = await ctx.db
        .selectFrom("chats",)
        .select(["thinking_visibility",],)
        .where("id", "=", settingsChatId,)
        .executeTakeFirstOrThrow();

      expect(row.thinking_visibility,).toBe("visible",);

      // Reload, reopen the modal: the persisted value is selected again.
      await openSettingsModal(page, settingsChatId,);
      const selected = await page.locator("[data-testid='settings-thinking-visibility']",).inputValue();
      expect(selected,).toBe("visible",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("ownership transfer moves the owner role to the selected participant", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: ERROR_ALLOWLIST, },);

    try {
      await openSettingsModal(page, ownershipChatId,);

      // The transfer section is visible to the chat creator.
      await page.locator("[data-testid='open-ownership-transfer']",).waitFor({
        state: "visible",
        timeout: 10_000,
      },);

      await page.locator("[data-testid='open-ownership-transfer']",).click();
      await page.locator("[data-testid='ownership-transfer-modal']",).waitFor({
        state: "visible",
        timeout: 10_000,
      },);

      // Pick the member participant as the new owner and submit.
      const postRes = page.waitForResponse(
        (res,) => res.url().includes("/transfer-ownership",) && res.request().method() === "POST",
        { timeout: 30_000, },
      );

      await page.selectOption("[data-testid='ownership-new-owner']", newUserActorId,);
      await page.locator("[data-testid='ownership-transfer-submit']",).click();
      const res = await postRes;
      expect(res.status(),).toBe(200,);

      // The modal closes without an error and the roles swap in the DB.
      await page.locator("[data-testid='ownership-transfer-modal']",).waitFor({
        state: "hidden",
        timeout: 15_000,
      },);

      await page.locator("[data-testid='ownership-error']",).waitFor({ state: "hidden", timeout: 5_000, },);

      const roles = await ctx.db
        .selectFrom("chat_participants",)
        .select(["actor_id", "role_in_chat",],)
        .where("chat_id", "=", ownershipChatId,)
        .execute();

      const byActor = new Map(roles.map((r,) => [r.actor_id, r.role_in_chat,]),);
      expect(byActor.get(newUserActorId,),).toBe("owner",);
      expect(byActor.get(SEED.solo.id,),).toBe("member",);

      // created_by is the frozen creator record — it stays with the
      // original creator; ownership itself moves in the owners set.
      const chat = await ctx.db
        .selectFrom("chats",)
        .select(["created_by",],)
        .where("id", "=", ownershipChatId,)
        .executeTakeFirstOrThrow();

      expect(chat.created_by,).toBe(SEED.solo.id,);

      const owners = await ctx.db
        .selectFrom("chat_owners",)
        .select("user_id",)
        .where("chat_id", "=", ownershipChatId,)
        .execute();

      expect(owners.map((r,) => r.user_id),).toEqual([newUserActorId,],);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
