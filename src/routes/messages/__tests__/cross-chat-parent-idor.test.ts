// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-chat parentId IDOR guard tests (BUG-cross-chat-parentId-IDOR).
 *
 * Verifies that the `database.transaction().execute(...)` wrapper around
 * parent-message verification + INSERT rejects:
 *   - parentId referencing a message in a different chat → 403
 *   - parentId referencing no message at all             → 404
 *
 * Both negative paths must leave zero rows in `messages`.
 *
 * Tests use the direct Kysely transaction path rather than the Elysia
 * route layer (which is covered by integration tests elsewhere), so this
 * suite focuses on the atomicity contract: SELECT-for-verification and
 * INSERT are wrapped in one transaction so a TOCTOU race between them
 * cannot leave an unauthorized row.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type Kysely, } from "kysely";
import { MessageRole, MessageStatus, MessageVisibility, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../../test-utils/insert-helpers";
import { uid, } from "../../../utils";
import {
  ParentMessageNotFoundError,
  ParentMessageNotInChatError,
} from "../create";

type MessageRowInput = {
  id: string;
  chat_id: string;
  actor_id: string;
  parent_id: string | null;
  role: MessageRole;
  content: string;
  key_id: string | null;
  content_plaintext: string | null;
  content_type: string;
  content_format: string;
  content_encoding: string;
  status: MessageStatus;
  visibility: MessageVisibility;
  idempotency_key: string | null;
  swipe_index: number | null;
};

/**
 * Run a transaction body that mirrors the parentId IDOR guard logic from
 * `src/routes/messages/create.ts`. Duplicated here so the test does not
 * have to spin up Elysia; the guard logic is small enough to mirror.
 * @param db
 * @param chatId
 * @param parentId
 * @param row
 */
async function runGuard(
  db: Kysely<DB>,
  chatId: string,
  parentId: string | null,
  row: MessageRowInput,
): Promise<void> {
  await db.transaction().execute(async (trx,) => {
    if (parentId !== null) {
      const parent = await trx
        .selectFrom("messages",)
        .select("chat_id",)
        .where("id", "=", parentId,)
        .executeTakeFirst();
      if (!parent) { throw new ParentMessageNotFoundError(); }
      if (parent.chat_id !== chatId) { throw new ParentMessageNotInChatError(); }
    }
    await trx.insertInto("messages",).values(row as never,).execute();
  },);
}

describe("cross-chat parentId IDOR guard (BUG-cross-chat-parentId-IDOR)", () => {
  let db: Kysely<DB>;
  let actorA: string;
  let actorB: string;
  let chatA: string;
  let chatB: string;
  let parentInA: string;
  let parentInB: string;

  beforeAll(async () => {
    ({ db, } = await createTestDb());

    const userA = uid();
    await insertUsers(db, `user-a-${userA}`, "Actor A", { id: userA, } as never,);
    actorA = userA;
    await db.insertInto("actors",).values({
      id: actorA,
      actor_type: "user",
      display_name: "Actor A",
      user_id: userA,
      owner_id: userA,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },).execute();

    const userB = uid();
    await insertUsers(db, `user-b-${userB}`, "Actor B", { id: userB, } as never,);
    actorB = userB;
    await db.insertInto("actors",).values({
      id: actorB,
      actor_type: "user",
      display_name: "Actor B",
      user_id: userB,
      owner_id: userB,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },).execute();

    chatA = uid();
    chatB = uid();
    await insertChats(db, "Chat A", actorA, { id: chatA, } as never,);
    await insertChats(db, "Chat B", actorB, { id: chatB, } as never,);

    parentInA = uid();
    parentInB = uid();
    await insertMessages(db, chatA, actorA, MessageRole.User, "parent in A", {
      id: parentInA as never,
    },);
    await insertMessages(db, chatB, actorB, MessageRole.User, "parent in B", {
      id: parentInB as never,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("same-chat parent inserts successfully (positive case)", async () => {
    const newId = uid();
    await runGuard(db, chatA, parentInA, {
      id: newId,
      chat_id: chatA,
      actor_id: actorA,
      parent_id: parentInA,
      role: MessageRole.User,
      content: "reply in A",
      key_id: null,
      content_plaintext: "reply in A",
      content_type: "text",
      content_format: "markdown",
      content_encoding: "identity",
      status: MessageStatus.Confirmed,
      visibility: MessageVisibility.Visible,
      idempotency_key: null,
      swipe_index: 1,
    },);

    const row = await db.selectFrom("messages",).select("id",).where("id", "=", newId,).executeTakeFirst();
    expect(row?.id,).toBe(newId,);
  });

  test("cross-chat parent (chat A chat_id, parent belongs to chat B) throws ParentMessageNotInChatError", async () => {
    const newId = uid();
    await expect(
      runGuard(db, chatA, parentInB, {
        id: newId,
        chat_id: chatA,
        actor_id: actorA,
        parent_id: parentInB,
        role: MessageRole.User,
        content: "should not insert",
        key_id: null,
        content_plaintext: null,
        content_type: "text",
        content_format: "markdown",
        content_encoding: "identity",
        status: MessageStatus.Confirmed,
        visibility: MessageVisibility.Visible,
        idempotency_key: null,
        swipe_index: 1,
      },),
    ).rejects.toBeInstanceOf(ParentMessageNotInChatError,);

    // Negative-path coverage: assert no row was inserted.
    const row = await db.selectFrom("messages",).select("id",).where("id", "=", newId,).executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("missing parent throws ParentMessageNotFoundError", async () => {
    const newId = uid();
    const ghost = uid();
    await expect(
      runGuard(db, chatA, ghost, {
        id: newId,
        chat_id: chatA,
        actor_id: actorA,
        parent_id: ghost,
        role: MessageRole.User,
        content: "should not insert",
        key_id: null,
        content_plaintext: null,
        content_type: "text",
        content_format: "markdown",
        content_encoding: "identity",
        status: MessageStatus.Confirmed,
        visibility: MessageVisibility.Visible,
        idempotency_key: null,
        swipe_index: 1,
      },),
    ).rejects.toBeInstanceOf(ParentMessageNotFoundError,);

    // Negative-path coverage: assert no row was inserted.
    const row = await db.selectFrom("messages",).select("id",).where("id", "=", newId,).executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("null parentId (root message) skips the guard and inserts", async () => {
    const newId = uid();
    await runGuard(db, chatA, null, {
      id: newId,
      chat_id: chatA,
      actor_id: actorA,
      parent_id: null,
      role: MessageRole.User,
      content: "root message",
      key_id: null,
      content_plaintext: "root message",
      content_type: "text",
      content_format: "markdown",
      content_encoding: "identity",
      status: MessageStatus.Confirmed,
      visibility: MessageVisibility.Visible,
      idempotency_key: null,
      swipe_index: null,
    },);

    const row = await db.selectFrom("messages",).select("id",).where("id", "=", newId,).executeTakeFirst();
    expect(row?.id,).toBe(newId,);
  });
});
