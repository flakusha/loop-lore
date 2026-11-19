// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Memory Panel CRUD + Audit (B2)
 *
 * Resource contract (parallel-safe by construction):
 *  - Creates its OWN chat, participant actor, and actor_memories rows under
 *    fresh randomUUID ids in beforeAll; content strings are unique per run.
 *  - Writes only DB rows (harness transaction scope); creates no files or
 *    uploads; the per-file browser server is torn down in afterAll.
 *  - Passes alone and in any order relative to other browser files.
 *
 * The three memory-panel BUGs named in the original skip rationale are Done
 * and their fixes are in-tree (see the inline note at the bottom). The row-level
 * CRUD skips below are unimplemented empty placeholders, not live blocked
 * tests: writing real E2E bodies against the shipped UI is a separate slice.
 * Create is covered by a live test that asserts the persisted DB row.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, waitForAlpineReady, } from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

const ERROR_ALLOWLIST = [
  /404 \(Not Found\)/,
  /401 \(Unauthorized\)/,
  /Failed to load resource/,
  // Cross-test noise: a sibling test's chat auto-generation failure is logged
  // through the frontend.error console channel while this file runs.
  /frontend\.error/,
  /Auto-generation failed/,
];

describe("Memory panel CRUD + audit (B2)", () => {
  let ctx: BrowserTestContext;
  let chatId: string;
  /** The character actor whose memories the panel edits. */
  let actorId: string;

  const runTag = crypto.randomUUID().slice(0, 8,);

  /** Open the chat and the memory panel (group chat so participants load). */
  async function openMemoryPanel(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.goto(`${ctx.url}/views/chat?chatid=${chatId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    },);

    await page.locator("[data-testid='chat-header']",).waitFor({ state: "attached", timeout: 30_000, },);
    await waitForAlpineReady(page, 15_000,);
    await page.locator("[data-testid='toggle-memory-panel']",).click();
    await page.locator("[data-testid='memory-panel']",).waitFor({ state: "visible", timeout: 10_000, },);
    // The character actor must resolve (this is exactly what fails in direct
    // chats — see BUG-memory-panel-fully-inert-in-direct-chats-participants-never-).
    await page.waitForFunction(
      () => {
        const el = document.querySelector<HTMLElement>("[x-data='chatState()']",);
        if (!el) { return false; }

        const d = window.Alpine.$data(el,) as {
          _getCharacterActorId?: () => string | null;
        };

        return !!d._getCharacterActorId?.();
      },
      undefined,
      { timeout: 15_000, },
    );
  }

  beforeAll(async () => {
    ctx = await createBrowserTest();

    chatId = crypto.randomUUID();
    actorId = crypto.randomUUID();

    // Group chat: only group chats load chat participants, which the memory
    // panel needs to resolve the character actor (see
    // BUG-memory-panel-fully-inert-in-direct-chats-participants-never-).
    await ctx.db
      .insertInto("chats",)
      .values({
        id: chatId,
        name: `Memory E2E ${runTag}`,
        type: "group",
        mode: "story",
        created_by: SEED.solo.id,
      },)
      .execute();

    await ctx.db
      .insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: SEED.solo.id, role_in_chat: "owner", },)
      .execute();

    // Character actor owned by the solo user so _canWriteActiveTab() passes.
    await ctx.db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: `Memory E2E Character ${runTag}`,
        user_id: SEED.solo.id,
        owner_id: SEED.solo.id,
        agent_type: "ai",
        settings: "{}",
        import_spec: "raw",
      },)
      .execute();

    await ctx.db
      .insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: actorId, role_in_chat: "member", },)
      .execute();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  test("creating a memory through the panel form persists a row", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: ERROR_ALLOWLIST, },);

    try {
      await openMemoryPanel(page,);

      const content = `mem-created-${runTag}`;
      await page.locator("[data-testid='memory-panel'] button",).filter({ hasText: "Add Memory", },).click();
      await page.locator("#memory-create-input",).fill(content,);
      // The create form's Save button sits next to a Cancel button.
      await page
        .locator("[data-testid='memory-panel'] button",)
        .filter({ hasText: "Save", },)
        .first()
        .click();

      // Persisted: the actor_memories row exists for the character actor.
      const start = Date.now();
      let row = await ctx.db
        .selectFrom("actor_memories",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .where("content", "=", content,)
        .executeTakeFirst();

      while (!row && Date.now() - start < 15_000) {
        await Bun.sleep(100,);
        row = await ctx.db
          .selectFrom("actor_memories",)
          .selectAll()
          .where("actor_id", "=", actorId,)
          .where("content", "=", content,)
          .executeTakeFirst();
      }

      expect(row,).not.toBeNull();
      expect(row!.review_status,).toBe("committed",);
      // NOTE: the panel list is expected to stay empty here — the memories
      // list response-envelope mismatch
      // (BUG-memory-panel-never-renders-memories-in-any-chat-response-env) means new memories never
      // render until that bug is fixed. The DB row above is the observable
      // outcome of the create interaction.
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  // ── Still skipped (2026-11-19): EMPTY placeholders (`() => {}`) with no
  // assertions. The blocking fixes are in-tree: loadMemories() reads
  // `data.data` (src/frontend/alpine/memory-panel-core.ts:72,77), direct-chat
  // participants are loaded (src/frontend/alpine/chat/world.ts:199-212), and
  // GET .../memories/audit is mounted (src/routes/memory-audit.ts:56).
  // Writing real E2E bodies against that shipped UI is a separate slice;
  // unskipping empty callbacks would only manufacture green no-op tests.

  test.skip("saving an inline edit persists the new content", () => {});
  test.skip("pinning a memory persists the pinned flag", () => {});
  test.skip("approving a pending memory persists review_status committed", () => {});
  test.skip("rejecting a pending memory persists review_status rejected", () => {});
  test.skip("deleting a memory removes the row and the panel entry", () => {});

  // Still skipped (2026-11-19): EMPTY placeholder; the audit route now exists
  // (src/routes/memory-audit.ts:56) and the panel fetches it
  // (src/frontend/alpine/memory-panel/audit.ts:41-49). Needs a real E2E body,
  // not an unskip — see the note above.
  test.skip("audit tab lists this session's CRUD rows and the action filter narrows them", () => {});
});
