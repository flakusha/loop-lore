// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for `recordMessageSeen` first-seen semantics.
 *
 * BUG-bug-message-seen-re-mark-clobbers-first-seen-timestamp:
 * Re-marking an already-seen row MUST preserve the original `seen_at`
 * timestamp; only `state` may change.
 *
 * Deterministic strategy: seed the ledger row directly with a known
 * `seen_at` value, then call `recordMessageSeen` and assert the stored
 * timestamp is unchanged. This avoids real-clock waits — the comparison
 * is against the literal we inserted, not "current time".
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertMessageSeen,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { deleteMessageSeen, getMessageSeen, recordMessageSeen, } from "./seen";

describe("recordMessageSeen — first-seen semantics", () => {
  let db: Kysely<DB>;
  const userId = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  const chatId = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, `user-${userId}`, "Seen User", { id: userId, } as never,);
    await insertActors(db, "Seen Actor", { id: actorId, user_id: userId, owner_id: userId, } as never,);
    await insertChats(db, "Seen Chat", userId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, actorId, {},);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * Seed a message and a pre-existing `message_seen` row with a fixed
   * `seen_at` literal. Returns the messageId + the literal timestamp.
   * @param state
   * @param seenAt
   */
  async function seedRow(
    state: "unseen" | "processing" | "seen",
    seenAt: string,
  ): Promise<{ messageId: string; seenAt: string }> {
    const messageId = crypto.randomUUID();
    await insertMessages(db, chatId, actorId, "user", "test", { id: messageId, } as never,);
    await db
      .insertInto("message_seen",)
      .values({
        id: `ms-${messageId}-${actorId}`,
        message_id: messageId,
        actor_id: actorId,
        state,
        seen_at: seenAt,
        created_at: seenAt,
      },)
      .execute();
    return { messageId, seenAt, };
  }

  /** @param messageId */
  async function readSeenAt(messageId: string,): Promise<string | null> {
    const row = await db
      .selectFrom("message_seen",)
      .select("seen_at",)
      .where("message_id", "=", messageId,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();
    return row?.seen_at ?? null;
  }

  /** @param messageId */
  async function readState(messageId: string,): Promise<string | null> {
    const row = await db
      .selectFrom("message_seen",)
      .select("state",)
      .where("message_id", "=", messageId,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();
    return row?.state ?? null;
  }

  test("re-mark to 'seen' preserves seeded seen_at", async () => {
    const original = "2020-01-01T00:00:00.000Z";
    const { messageId, } = await seedRow("seen", original,);

    const result = await recordMessageSeen(db, messageId, chatId, actorId, userId, null, "seen",);
    expect(result,).toEqual({ ok: true, },);

    expect(await readSeenAt(messageId,),).toBe(original,);
  });

  test("seen → processing preserves seen_at (state changes, timestamp preserved)", async () => {
    const original = "2021-06-15T12:34:56.789Z";
    const { messageId, } = await seedRow("seen", original,);

    await recordMessageSeen(db, messageId, chatId, actorId, userId, null, "processing",);

    expect(await readSeenAt(messageId,),).toBe(original,);
    expect(await readState(messageId,),).toBe("processing",);
  });

  test("processing → seen preserves seen_at (state changes, timestamp preserved)", async () => {
    const original = "2022-03-10T08:15:00.000Z";
    const { messageId, } = await seedRow("processing", original,);

    await recordMessageSeen(db, messageId, chatId, actorId, userId, null, "seen",);

    expect(await readSeenAt(messageId,),).toBe(original,);
    expect(await readState(messageId,),).toBe("seen",);
  });

  test("seen → unseen preserves seen_at (no COALESCE reset on re-mark)", async () => {
    // Although the route handles unseen via DELETE, the service-level
    // contract for recordMessageSeen("unseen") upserts without dropping
    // seen_at — preserving the original first-seen timestamp.
    const original = "2019-12-31T23:59:59.000Z";
    const { messageId, } = await seedRow("seen", original,);

    await recordMessageSeen(db, messageId, chatId, actorId, userId, null, "unseen",);

    expect(await readSeenAt(messageId,),).toBe(original,);
  });

  test("re-mark on non-existent row creates the row with seen_at", async () => {
    // Sanity check: INSERT path is not affected by the COALESCE fix.
    const messageId = crypto.randomUUID();
    await insertMessages(db, chatId, actorId, "user", "test", { id: messageId, } as never,);

    const result = await recordMessageSeen(db, messageId, chatId, actorId, userId, null, "seen",);
    expect(result,).toEqual({ ok: true, },);
    const ts = await readSeenAt(messageId,);
    expect(ts,).toBeTruthy();
  });

  describe("getMessageSeen", () => {
    const otherUserId = crypto.randomUUID();
    const otherActorId = crypto.randomUUID();

    beforeAll(async () => {
      await insertUsers(db, `user-${otherUserId}`, "Second Viewer", { id: otherUserId, } as never,);
      await insertActors(
        db,
        "Second Actor",
        { id: otherActorId, user_id: otherUserId, owner_id: otherUserId, } as never,
      );
      await insertChatParticipants(db, chatId, otherActorId, {},);
    },);

    test("returns grouped viewers with mapped fields; null seen_at maps to null", async () => {
      const messageId = crypto.randomUUID();
      await insertMessages(db, chatId, actorId, "user", "test", { id: messageId, } as never,);
      await insertMessageSeen(db, messageId, actorId, { state: "seen", seen_at: "2020-05-05T05:05:05.000Z", },);
      await insertMessageSeen(db, messageId, otherActorId, { state: "unseen", seen_at: null, },);

      const result = await getMessageSeen(db, messageId, chatId, userId, null,);
      if (!("ok" in result)) { throw new Error(`expected success, got ${result.code}`,); }
      expect(result.ok,).toBe(true,);

      const byActor = Object.fromEntries(result.viewers.map((v,) => [v.actorId, v,]),);
      expect(byActor[actorId],).toEqual({ actorId, state: "seen", seenAt: "2020-05-05T05:05:05.000Z", },);
      expect(byActor[otherActorId],).toEqual({ actorId: otherActorId, state: "unseen", seenAt: null, },);
    });

    test("access denied: non-participant user gets not_found", async () => {
      const messageId = crypto.randomUUID();
      await insertMessages(db, chatId, actorId, "user", "test", { id: messageId, } as never,);

      // seen.ts returns the bare ServiceError (no { ok, error } wrapper).
      const result = await getMessageSeen(db, messageId, chatId, crypto.randomUUID(), null,);
      expect(result,).toEqual({ code: "not_found", message: "Chat not found", },);
    });
  });

  describe("deleteMessageSeen", () => {
    test("deletes an existing seen-state row", async () => {
      const { messageId, } = await seedRow("seen", "2020-01-01T00:00:00.000Z",);

      const result = await deleteMessageSeen(db, messageId, chatId, actorId, userId, null,);
      expect(result,).toEqual({ ok: true, },);
      expect(await readState(messageId,),).toBeNull();
    });

    test("access denied: non-participant user gets not_found and the row survives", async () => {
      const { messageId, } = await seedRow("seen", "2020-01-01T00:00:00.000Z",);

      const result = await deleteMessageSeen(db, messageId, chatId, actorId, crypto.randomUUID(), null,);
      expect(result,).toEqual({ code: "not_found", message: "Chat not found", },);
      expect(await readState(messageId,),).toBe("seen",);
    });
  });

  describe("recordMessageSeen — insert paths and access control", () => {
    test("default state is 'seen' and sets seen_at", async () => {
      const messageId = crypto.randomUUID();
      await insertMessages(db, chatId, actorId, "user", "test", { id: messageId, } as never,);

      const result = await recordMessageSeen(db, messageId, chatId, actorId, userId, null,);
      expect(result,).toEqual({ ok: true, },);
      expect(await readState(messageId,),).toBe("seen",);
      expect(await readSeenAt(messageId,),).toBeTruthy();
    });

    test("insert with state 'processing' sets seen_at", async () => {
      const messageId = crypto.randomUUID();
      await insertMessages(db, chatId, actorId, "user", "test", { id: messageId, } as never,);

      await recordMessageSeen(db, messageId, chatId, actorId, userId, null, "processing",);

      expect(await readState(messageId,),).toBe("processing",);
      expect(await readSeenAt(messageId,),).toBeTruthy();
    });

    test("insert with state 'unseen' leaves seen_at null", async () => {
      const messageId = crypto.randomUUID();
      await insertMessages(db, chatId, actorId, "user", "test", { id: messageId, } as never,);

      await recordMessageSeen(db, messageId, chatId, actorId, userId, null, "unseen",);

      expect(await readState(messageId,),).toBe("unseen",);
      expect(await readSeenAt(messageId,),).toBeNull();
    });

    test("access denied: non-participant user gets not_found and no row is created", async () => {
      const messageId = crypto.randomUUID();
      await insertMessages(db, chatId, actorId, "user", "test", { id: messageId, } as never,);

      const result = await recordMessageSeen(db, messageId, chatId, actorId, crypto.randomUUID(), null, "seen",);
      expect(result,).toEqual({ code: "not_found", message: "Chat not found", },);
      expect(await readState(messageId,),).toBeNull();
    });
  });
});
