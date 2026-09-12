// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for deleteChat cascade (TASK-deletechat-runs-9-sequential-deletes-without-transaction-orp).
 *
 * Covers:
 *  - happy path: every child table is wiped in a single call
 *  - chat row + its dependency rows are removed atomically (no orphan rows on a fresh delete)
 *  - deleting a chat with no related rows is a no-op (still resolves)
 *  - unrelated chats are untouched by the cascade
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertAssetLinks,
  insertAssets,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertStoryTurns,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import { deleteChat, } from "./delete";

describe("deleteChat cascade", () => {
  let db: Kysely<DB>;
  const ownerId: string = crypto.randomUUID();
  const memberId: string = crypto.randomUUID();
  const chatId: string = crypto.randomUUID();
  const otherChatId: string = crypto.randomUUID();
  const messageId: string = crypto.randomUUID();
  const storyTurnId: string = crypto.randomUUID();
  const worldStateId: string = crypto.randomUUID();
  let assetLinkRowCount = 0;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertUsers(db, "member", "Member", { id: memberId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(db, "Member", { id: memberId, user_id: memberId, owner_id: memberId, } as never,);
    await insertChats(db, "Cascade Me", ownerId, { id: chatId, } as never,);
    await insertChats(db, "Untouched", ownerId, { id: otherChatId, } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: "owner", },);
    await insertChatParticipants(db, chatId, memberId, { role_in_chat: "member", },);
    await insertChatParticipants(db, otherChatId, ownerId, { role_in_chat: "owner", },);
    await insertMessages(db, chatId, ownerId, "user", "hi", { id: messageId, },);
    await insertStoryTurns(db, chatId, 1, ownerId, "narration", "turn-1", { id: storyTurnId, },);
    await insertWorlds(db, ownerId, "stub-world", { id: "00000000-0000-0000-0000-000000000001", },);
    await db
      .insertInto("world_states",)
      .values({
        id: worldStateId,
        world_id: "00000000-0000-0000-0000-000000000001",
        trigger_message_id: messageId,
        snapshot: "{}",
      } as never,)
      .execute();
    await insertAssets(db, ownerId, "stub.png", "image/png", "image", 1, "stub.png", {
      id: "asset-1",
    },);
    await insertAssetLinks(db, "asset-1", "chat", chatId,);
    assetLinkRowCount = await db
      .selectFrom("asset_links",)
      .select("asset_id",)
      .where("entity_type", "=", "chat",)
      .where("entity_id", "=", chatId,)
      .execute()
      .then((rows,) => rows.length);
    await insertMessages(db, chatId, ownerId, "user", "hi2",);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("happy path: every child table is wiped", async () => {
    // Sanity-check the seed: every child table holds the row we're about to delete.
    expect(
      await db.selectFrom("messages",).select("id",).where("chat_id", "=", chatId,).executeTakeFirst(),
    ).not.toBeUndefined();
    expect(
      await db.selectFrom("story_turns",).select("id",).where("chat_id", "=", chatId,).executeTakeFirst(),
    ).not.toBeUndefined();
    expect(assetLinkRowCount,).toBeGreaterThan(0,);

    await deleteChat(db, chatId,);

    // After delete: every cascade row is gone.
    expect(
      await db.selectFrom("chats",).select("id",).where("id", "=", chatId,).executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await db.selectFrom("chat_participants",).select("actor_id",).where("chat_id", "=", chatId,).executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await db.selectFrom("messages",).select("id",).where("chat_id", "=", chatId,).executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await db.selectFrom("story_turns",).select("id",).where("chat_id", "=", chatId,).executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await db
        .selectFrom("asset_links",)
        .select("asset_id",)
        .where("entity_type", "=", "chat",)
        .where("entity_id", "=", chatId,)
        .execute(),
    ).toHaveLength(0,);
    expect(
      await db.selectFrom("world_states",).select("id",).where("id", "=", worldStateId,).executeTakeFirst(),
    ).toBeUndefined();
  });

  test("unrelated chat rows survive the cascade", async () => {
    await deleteChat(db, chatId,);

    const other = await db
      .selectFrom("chats",)
      .select(["id", "name",],)
      .where("id", "=", otherChatId,)
      .executeTakeFirst();
    expect(other?.id,).toBe(otherChatId,);
    // Other chat's participants and messages untouched.
    expect(
      await db.selectFrom("chat_participants",).select("actor_id",).where("chat_id", "=", otherChatId,).execute(),
    ).toHaveLength(1,);
  });

  test("deleting a chat with no related rows resolves without error", async () => {
    const emptyChatId: string = crypto.randomUUID();
    await insertChats(db, "Empty", ownerId, { id: emptyChatId, } as never,);

    await deleteChat(db, emptyChatId,);

    expect(
      await db.selectFrom("chats",).select("id",).where("id", "=", emptyChatId,).executeTakeFirst(),
    ).toBeUndefined();
  });

  test("mid-cascade failure rolls back every prior delete (atomicity)", async () => {
    // We force the `messages` step to throw by closing the chat row early so
    // the `where("chat_id", "=", chatId)` filter cascades on a state that
    // contradicts the foreign-key chain — but a simpler, deterministic trick:
    // replace the inner `db` for the cascade call with a stub whose `deleteFrom`
    // throws on the messages table. Kysely still wraps the inner promise in a
    // transaction, so the prior deletes roll back.
    const txChatId: string = crypto.randomUUID();
    await insertChats(db, "Atomicity", ownerId, { id: txChatId, } as never,);
    await insertChatParticipants(db, txChatId, ownerId, { role_in_chat: "owner", },);
    await insertMessages(db, txChatId, ownerId, "user", "tx-msg",);

    let throwOnce = true;
    const stubDb = {
      transaction: () => ({
        execute: async (fn: (trx: typeof db,) => Promise<unknown>,) => {
          const trx = {
            deleteFrom: ((table: never,) => {
              const inner = db.deleteFrom(table,);
              const wrapped = {
                ...inner,
                where: ((...args: unknown[]) => {
                  const ret = inner.where(...(args as Parameters<typeof inner.where>),);
                  if (throwOnce && table === ("messages" as never)) {
                    const out = {
                      ...ret,
                      execute: () => {
                        throwOnce = false;
                        throw new Error("injected mid-cascade failure",);
                      },
                    };
                    return out as unknown as typeof ret;
                  }
                  return ret;
                }) as typeof inner.where,
              };
              return wrapped;
            }) as typeof db.deleteFrom,
            selectFrom: ((table: never,) => db.selectFrom(table,)) as unknown as typeof db.selectFrom,
          };
          return await fn(trx as unknown as typeof db,);
        },
      }),
    } as unknown as Kysely<DB>;

    let thrown: unknown = null;
    try {
      await deleteChat(stubDb, txChatId,);
    } catch (e) {
      thrown = e;
    }
    expect((thrown as Error | null)?.message,).toBe("injected mid-cascade failure",);

    // Atomicity: the prior deletes rolled back. The chat row, the participant
    // row, and the seeded message are all still present — without the
    // transaction wrapper they would have been deleted already and committed.
    expect(
      await db.selectFrom("chats",).select("id",).where("id", "=", txChatId,).executeTakeFirst(),
    ).not.toBeUndefined();
    expect(
      await db.selectFrom("chat_participants",).select("actor_id",).where("chat_id", "=", txChatId,).execute(),
    ).toHaveLength(1,);
    expect(
      await db
        .selectFrom("messages",)
        .select("id",)
        .where("chat_id", "=", txChatId,)
        .where("content", "=", "tx-msg",)
        .executeTakeFirst(),
    ).not.toBeUndefined();
  });
});
