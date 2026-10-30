// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Chat Batch Operations
 *
 * Covers gap B3: selecting chats in the chat list panel and driving the
 * batch bar — archive, delete (with native confirm), export (download).
 *
 * Resource contract:
 *  - Each test seeds its OWN chats (unique names via Date.now) owned by the
 *    harness solo user, directly through ctx.db. No test reads another
 *    test's rows; order-independent by construction.
 *  - DB writes are covered by the harness transaction rollback. The export
 *    test only inspects the Playwright Download object (suggestedFilename),
 *    never saving a file — nothing outside the transaction is created.
 *  - The native confirm() dialog for batch delete is auto-accepted via a
 *    page-scoped dialog handler installed inside the test.
 * @pillar chat-management
 */

import type { Page, } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, waitForAlpineReady, } from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

describe("Chat batch operations E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  /** Seed chats owned by the solo user with unique names; returns their ids. */
  async function seedOwnedChats(names: string[],): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) {
      const id = crypto.randomUUID();
      await ctx.db
        .insertInto("chats",)
        .values({
          id,
          name,
          type: "direct",
          mode: "direct",
          created_by: SEED.solo.id,
        },)
        .execute();

      await ctx.db
        .insertInto("chat_participants",)
        .values({
          chat_id: id,
          actor_id: SEED.solo.id,
          role_in_chat: "owner",
        },)
        .execute();

      // Production create path seeds the creator's owners row (owners set
      // is the authority source) — mirror it so batch ops see the chats.
      await ctx.db
        .insertInto("chat_owners",)
        .values({ chat_id: id, user_id: SEED.solo.id, },)
        .execute();

      ids.push(id,);
    }

    return ids;
  }

  async function gotoChat(page: Page,) {
    await page.goto(`${ctx.url}/views/chat`, { waitUntil: "commit", timeout: 30_000, },);
    await page.locator("[data-testid='message-list']",).waitFor({ state: "attached", timeout: 30_000, },);
  }

  /** Open the chat list panel and check the rows for the given chat names. */
  async function selectChats(page: Page, names: string[],) {
    // Navigation setup (same pattern as htmx-alpine.browser.ts): reveal the
    // panel; the actual interaction (checkbox + batch bar clicks) is real UI.
    await waitForAlpineReady(page, 15_000,);
    await page.evaluate(() => {
      const alpine = (globalThis as unknown as { Alpine: { store: (name: string,) => unknown } }).Alpine;
      (alpine.store("ui",) as { showChatList: boolean }).showChatList = true;
    },);

    const panel = page.locator("[data-testid='chat-list-panel']",);
    await panel.waitFor({ state: "visible", timeout: 10_000, },);
    for (const name of names) {
      const row = panel.locator(".nav-item-row", { hasText: name, },);
      await row.waitFor({ state: "visible", timeout: 10_000, },);
      await row.locator("input[type='checkbox']",).check();
    }

    // Batch bar appears with the count of selected chats.
    await panel.getByText(`${names.length} selected`,).waitFor({ state: "visible", timeout: 10_000, },);
  }

  test("batchArchive moves selected chats out of the active list and flags them archived", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    const stamp = Date.now();
    const names = [`Batch Arch A ${stamp}`, `Batch Arch B ${stamp}`,];
    const ids = await seedOwnedChats(names,);
    try {
      await gotoChat(page,);
      await selectChats(page, names,);

      const archiveRes = page.waitForResponse(
        (res,) => res.url().includes("/api/v1/chats/batch/archive",) && res.request().method() === "POST",
        { timeout: 30_000, },
      );

      await page.locator("[data-testid='chat-list-panel'] button[title='Archive selected']",).click();
      const res = await archiveRes;
      expect(res.ok(),).toBe(true,);

      // UI: rows left the active list and the selection cleared.
      const panel = page.locator("[data-testid='chat-list-panel']",);
      await panel.locator(".nav-item-row", { hasText: names[0]!, },).waitFor({ state: "detached", timeout: 15_000, },);
      expect(await panel.locator(".nav-item-row", { hasText: names[1]!, },).count(),).toBe(0,);

      // DB: both chats flagged archived (is_pinned doubles as archive flag).
      for (const id of ids) {
        const row = await ctx.db
          .selectFrom("chats",)
          .select(["id", "is_pinned",],)
          .where("id", "=", id,)
          .executeTakeFirst();

        expect(row,).not.toBeNull();
        expect(row!.is_pinned,).toBe("archived",);
      }
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("batchDelete removes selected chats from the list and the database", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    const stamp = Date.now();
    const names = [`Batch Del A ${stamp}`, `Batch Del B ${stamp}`,];
    const ids = await seedOwnedChats(names,);
    try {
      await gotoChat(page,);
      await selectChats(page, names,);

      // batchDelete() calls window.confirm — accept it.
      page.once("dialog", (dialog,) => void dialog.accept(),);

      const deleteRes = page.waitForResponse(
        (res,) => res.url().includes("/api/v1/chats/batch/delete",) && res.request().method() === "POST",
        { timeout: 30_000, },
      );

      await page.locator("[data-testid='chat-list-panel'] button[title='Delete selected']",).click();
      const res = await deleteRes;
      expect(res.ok(),).toBe(true,);

      // UI: rows gone.
      const panel = page.locator("[data-testid='chat-list-panel']",);
      await panel.locator(".nav-item-row", { hasText: names[0]!, },).waitFor({ state: "detached", timeout: 15_000, },);
      expect(await panel.locator(".nav-item-row", { hasText: names[1]!, },).count(),).toBe(0,);

      // DB: hard-deleted.
      for (const id of ids) {
        const row = await ctx.db
          .selectFrom("chats",)
          .select("id",)
          .where("id", "=", id,)
          .executeTakeFirst();

        expect(row,).toBeUndefined();
      }
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("batchExport downloads a chats-export.json payload and leaves chats intact", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    const stamp = Date.now();
    const names = [`Batch Exp A ${stamp}`,];
    const ids = await seedOwnedChats(names,);
    try {
      await gotoChat(page,);
      await selectChats(page, names,);

      const exportRes = page.waitForResponse(
        (res,) => res.url().includes("/api/v1/chats/batch/export",) && res.request().method() === "POST",
        { timeout: 30_000, },
      );

      const downloadPromise = page.waitForEvent("download", { timeout: 30_000, },);
      await page.locator("[data-testid='chat-list-panel'] button[title='Export selected']",).click();
      const [res, download,] = await Promise.all([exportRes, downloadPromise,],);
      expect(res.ok(),).toBe(true,);

      // The client names the blob download chats-export.json (chat-management.ts).
      expect(download.suggestedFilename(),).toBe("chats-export.json",);

      // Export must not mutate: the chat row survives.
      const row = await ctx.db
        .selectFrom("chats",)
        .select("id",)
        .where("id", "=", ids[0]!,)
        .executeTakeFirst();

      expect(row,).not.toBeNull();
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
