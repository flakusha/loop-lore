// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Message-Level Actions (B4) — edit / delete / regenerate
 *
 * Resource contract (parallel-safe by construction):
 *  - Creates its OWN chat, participant actor, and messages under fresh
 *    randomUUID ids in beforeAll; content strings are unique per run.
 *  - Writes only DB rows (harness transaction scope); creates no files or
 *    uploads; the per-file browser server is torn down in afterAll.
 *  - The generation path uses the MockLLMProvider createBrowserTest()
 *    registers as the default provider — no network, no API keys.
 *  - Passes alone and in any order relative to other browser files.
 *
 * Covered interactions (message-list.html, Detailed action row):
 *  - ✏️ startEdit → edit-textarea → saveEdit (PATCH /api/v1/messages/:id)
 *  - 🗑 removeMessage with its window.confirm dialog (DELETE /messages/:id)
 *  - ♻ regenerateVariant on an assistant message
 *    (POST /api/v1/generation/regenerate → new assistant message)
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

describe("Message actions: edit, delete, regenerate (B4)", () => {
  let ctx: BrowserTestContext;
  let chatId: string;
  let userMessageId: string;
  let assistantMessageId: string;

  const runTag = crypto.randomUUID().slice(0, 8,);
  const userText = `msg-actions-user-${runTag}`;
  const assistantText = `msg-actions-assistant-${runTag}`;
  const editedText = `msg-actions-edited-${runTag}`;

  /** Open the chat; optionally wait for one message text to render. */
  async function openChat(
    page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
    waitText?: string,
  ) {
    await page.goto(`${ctx.url}/views/chat?chatid=${chatId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    },);

    await page.locator("[data-testid='chat-header']",).waitFor({ state: "attached", timeout: 30_000, },);
    await waitForAlpineReady(page, 15_000,);
    if (waitText) {
      await page.locator("#message-list",).getByText(waitText,).waitFor({ timeout: 15_000, },);
    }
  }

  beforeAll(async () => {
    ctx = await createBrowserTest();

    chatId = crypto.randomUUID();
    userMessageId = crypto.randomUUID();
    assistantMessageId = crypto.randomUUID();

    await ctx.db
      .insertInto("chats",)
      .values({
        id: chatId,
        name: `Msg Actions E2E ${runTag}`,
        type: "direct",
        mode: "direct",
        created_by: SEED.solo.id,
      },)
      .execute();

    await ctx.db
      .insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: SEED.solo.id, role_in_chat: "owner", },)
      .execute();

    for (
      const [id, role, content, parent,] of [
        [userMessageId, "user", userText, null,],
        [assistantMessageId, "assistant", assistantText, userMessageId,],
      ] as const
    ) {
      await ctx.db
        .insertInto("messages",)
        .values({
          id,
          chat_id: chatId,
          actor_id: SEED.solo.id,
          role,
          content,
          content_format: "markdown",
          content_type: "text",
          content_encoding: "identity",
          status: "confirmed",
          visibility: "visible",
          parent_id: parent,
        },)
        .execute();
    }
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function dbMessage(id: string,) {
    return ctx.db
      .selectFrom("messages",)
      .selectAll()
      .where("id", "=", id,)
      .executeTakeFirst();
  }

  test("editing a message from the action row persists the new content", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: ERROR_ALLOWLIST, },);

    try {
      // Detailed mode exposes the per-message action button row.
      await page.addInitScript(() => localStorage.setItem("chat-detail-level", "Detailed",));
      await openChat(page, userText,);

      // ✏️ (title Edit) on the user message opens the inline editor.
      const editButtons = page.locator("button.btn-icon-action",).filter({ hasText: "✏️", },);
      await editButtons.first().waitFor({ state: "visible", timeout: 10_000, },);
      await editButtons.first().click();

      const textarea = page.locator(".edit-textarea",);
      await textarea.waitFor({ state: "visible", timeout: 10_000, },);
      await textarea.fill(editedText,);
      await page.locator(".edit-actions button",).filter({ hasText: "Save", },).click();

      // Persisted: PATCH /api/v1/messages/:id updated the row.
      const start = Date.now();
      for (;;) {
        const row = await dbMessage(userMessageId,);
        if (row?.content === editedText) { break; }
        if (Date.now() - start > 15_000) {
          throw new Error(`message content stayed '${row?.content}', expected '${editedText}'`,);
        }

        await Bun.sleep(100,);
      }

      // Panel state: reload and assert the edited content + edited marker.
      await openChat(page, editedText,);
      await page.locator("[data-testid='edited-indicator']",).first().waitFor({
        state: "visible",
        timeout: 15_000,
      },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("deleting a message through the confirm dialog removes it", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: ERROR_ALLOWLIST, },);

    try {
      await page.addInitScript(() => localStorage.setItem("chat-detail-level", "Detailed",));
      // removeMessage gates on window.confirm — accept it as the user does.
      // (The user message was renamed by the edit test; wait for the assistant
      // message, which every test leaves in place.)
      page.on("dialog", (dialog,) => void dialog.accept(),);
      await openChat(page, assistantText,);

      const doomedId = crypto.randomUUID();
      const doomedText = `msg-actions-doomed-${runTag}`;
      await ctx.db
        .insertInto("messages",)
        .values({
          id: doomedId,
          chat_id: chatId,
          actor_id: SEED.solo.id,
          role: "user",
          content: doomedText,
          content_format: "markdown",
          content_type: "text",
          content_encoding: "identity",
          status: "confirmed",
          visibility: "visible",
          parent_id: userMessageId,
        },)
        .execute();

      // Reload so the doomed message is part of the rendered list.
      await openChat(page, doomedText,);

      // 🗑 (action-remove) triggers confirm() then DELETE /api/v1/messages/:id.
      // Scope to the doomed message's own .message-content block so the click
      // cannot land on a sibling row's remove button.
      const doomedRow = page.locator("#message-list .message-content",).filter({ hasText: doomedText, },);
      await doomedRow.waitFor({ state: "visible", timeout: 15_000, },);
      await doomedRow.locator("button.btn-icon-action.action-remove",).last().click();

      const start = Date.now();
      for (;;) {
        const row = await dbMessage(doomedId,);
        // The default (non-hard) UI remove soft-deletes the row.
        if (row?.visibility === "hidden_by_user") { break; }
        if (Date.now() - start > 15_000) {
          throw new Error(`message row not removed (visibility=${row?.visibility})`,);
        }

        await Bun.sleep(100,);
      }

      await page.locator("#message-list",).getByText(doomedText,).waitFor({
        state: "hidden",
        timeout: 15_000,
      },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("regenerating an assistant message swaps in a new mock reply", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: ERROR_ALLOWLIST, },);

    try {
      await page.addInitScript(() => localStorage.setItem("chat-detail-level", "Detailed",));
      await openChat(page, assistantText,);

      const beforeCount = Number(
        (await ctx.db
          .selectFrom("messages",)
          .select(ctx.db.fn.countAll().as("count",),)
          .where("chat_id", "=", chatId,)
          .where("role", "=", "assistant",)
          .executeTakeFirstOrThrow()).count,
      );

      // ♻ (title Regenerate) on the assistant message row.
      const regenButton = page.locator("button.btn-icon-action",).filter({ hasText: "♻", },);
      await regenButton.first().waitFor({ state: "visible", timeout: 10_000, },);

      // POST /api/v1/generation/regenerate against the mock provider.
      const regenRes = page.waitForResponse(
        (res,) => res.url().includes("/api/v1/generation/regenerate",) && res.request().method() === "POST",
        { timeout: 30_000, },
      );

      await regenButton.first().click();
      const res = await regenRes;
      expect(res.status(),).toBe(200,);

      // After the swap a new assistant message exists (mock canned reply).
      const start = Date.now();
      let afterCount = beforeCount;
      for (;;) {
        const row = await ctx.db
          .selectFrom("messages",)
          .select(ctx.db.fn.countAll().as("count",),)
          .where("chat_id", "=", chatId,)
          .where("role", "=", "assistant",)
          .executeTakeFirstOrThrow();

        afterCount = Number(row.count,);
        if (afterCount > beforeCount) { break; }
        if (Date.now() - start > 20_000) {
          throw new Error(`assistant message count stayed ${afterCount}, expected > ${beforeCount}`,);
        }

        await Bun.sleep(100,);
      }

      expect(afterCount,).toBeGreaterThan(beforeCount,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
