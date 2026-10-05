// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for src/routes/messages/swipe-race-insert.ts.
 *
 * Covers .plan/tickets/BUG-chat-message-create-swipe-race.md and
 * .plan/tickets/BUG-chat-idempotency-not-enforced.md.
 *
 * - Concurrent user-message inserts at the same parent produce distinct
 *   swipe_indexes (retry-on-collision wraps SELECT-MAX + INSERT).
 * - findByIdempotencyKey short-circuits duplicate POSTs.
 * - Different chat_id with the same idempotency_key is independent.
 * - A null idempotency_key never triggers the idempotency short-circuit.
 *
 * NOTE on Promise.all as a "concurrency" probe (TASK-audit-follow-up-chat-swipe-index-race-test-uses-promise-all-).
 *
 * Promise.all on the JS event loop does NOT produce a true concurrent race on
 * the same DB row. The async functions handed to Promise.all run serially at
 * the microtask checkpoint; only the I/O (Kysely → bun:sqlite) overlaps. For
 * an in-process bun:sqlite handle, every Promise.all branch sees the same
 * serialised stream, so SELECT-MAX + INSERT completes one at a time and the
 * unique-index collisions the retry loop guards against never fire.
 *
 * What this test IS verifying, in order of priority:
 *   1. Uniqueness — every committed row under (chat_id, parent_id) gets a
 *      distinct swipe_index (the in-memory Set check on the returned rows).
 *   2. Monotonicity — indexes are dense and start at MAX(parent.swipe_index)+1.
 *   3. Final commit ordering — after Promise.all settles, every committed
 *      swipe_index is non-null and the set is exactly {1..fanout}.
 *
 * What this test is NOT verifying:
 *   - True OS-thread or cross-process races (would require
 *     `child_process.fork` workers with separate bun:sqlite handles, or
 *     `bun:test --maxConcurrency` workers, per the original ticket's
 *     option 1/2).
 *   - The unique-index constraint's enforcement under contention — that
 *     is covered indirectly by the forced-collision test below
 *     (SwipeInsertExhaustedError), not by the Promise.all block.
 *
 * Decision: ticket option 4 — keep Promise.all, document its limitation, and
 * assert uniqueness + monotonicity + final-commit ordering (already in place
 * below). The retry-on-collision path is exercised by the explicit
 * forced-collision test in the same describe block. To exercise the retry
 * loop against a real race, switch to child_process.fork workers — out of
 * scope for this audit fix.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageContentFormat, MessageContentType, MessageRole, MessageStatus, } from "../../db/enums";
import type { ContentEncoding, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { insertUserMessageRow, } from "./insert-message";
import {
  findByIdempotencyKey,
  insertUserMessageWithRetry,
  isIdempotencyUniqueViolation,
  SwipeInsertExhaustedError,
} from "./swipe-race-insert";

describe("swipe-race-insert — concurrent insert + retry", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let actorId: string;
  let parentMessageId: string;

  beforeAll(async () => {
    ({ db, } = await createTestDb());

    const userId = uid();
    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);
    actorId = userId;
    // messages.actor_id → actors.id
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "user",
        display_name: "Test Actor",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    chatId = uid();
    await insertChats(db, "Race Test Chat", actorId, { id: chatId, } as never,);

    parentMessageId = uid();
    await insertMessages(db, chatId, actorId, MessageRole.User, "parent", {
      id: parentMessageId,
      swipe_index: 0,
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  const makeBase = (id: string,) => ({
    id,
    chatId,
    actorId,
    parentId: parentMessageId,
    storedContent: "x",
    storedKeyId: null as string | null,
    contentEncoding: "utf8" as ContentEncoding,
    idempotencyKey: null as string | null,
  });

  test("concurrent inserts at the same parent produce distinct swipe_indexes", async () => {
    const fanout = 8;
    const results = await Promise.all(
      Array.from({ length: fanout, }, () => insertUserMessageWithRetry(db, makeBase(uid(),),),),
    );

    expect(results,).toHaveLength(fanout,);
    const indexes = results.map((r,) => r.swipeIndex).sort((a, b,) => (a ?? 0) - (b ?? 0));
    // Each index must be unique and start at 1 (MAX(parent.swipe_index=0) + 1)
    expect(new Set(indexes,).size,).toBe(fanout,);
    expect(indexes[0],).toBe(1,);
    expect(indexes[fanout - 1],).toBe(fanout,);
  });

  test("parent-less insert leaves swipe_index null", async () => {
    const newChatId = uid();
    await insertChats(db, "Top-level Chat", actorId, { id: newChatId, } as never,);
    const result = await insertUserMessageWithRetry(db, {
      ...makeBase(uid(),),
      chatId: newChatId,
      parentId: null,
    },);

    expect(result.swipeIndex,).toBeNull();
  });

  test("exhausted retry throws SwipeInsertExhaustedError", async () => {
    // Force a collision by pre-inserting a row with swipe_index = MAX_INSEMPTS
    // so each retry attempt also collides. We use a stub id and let the
    // helper exhaust the loop on the unique index.
    const forcedChat = uid();
    await insertChats(db, "Exhaust Test Chat", actorId, { id: forcedChat, } as never,);
    const forcedParent = uid();
    await insertMessages(db, forcedChat, actorId, MessageRole.User, "p", {
      id: forcedParent,
      swipe_index: 0,
    } as never,);

    // Pre-fill swipe_indexes 1..MAX to collide every retry attempt.
    for (let i = 1; i <= 8; i++) {
      await db
        .insertInto("messages",)
        .values({
          id: uid(),
          chat_id: forcedChat,
          actor_id: actorId,
          parent_id: forcedParent,
          role: MessageRole.User,
          content: "blocked",
          content_format: MessageContentFormat.Markdown,
          content_type: MessageContentType.Text,
          content_encoding: "utf8" as ContentEncoding,
          status: MessageStatus.Confirmed,
          visibility: "visible",
          swipe_index: i,
        },)
        .execute();
    }

    // Now attempt an insert at swipe_index 9 — should also collide
    // because the helper computes MAX then +1, then retries incrementing
    // attempt counter only via the catch; since the underlying unique
    // index covers (chat_id, parent_id, swipe_index) but a NEW swipe_index
    // 9 is valid (no row at 9), this case actually succeeds. Adjust:
    // fill 9..16 too.
    for (let i = 9; i <= 16; i++) {
      await db
        .insertInto("messages",)
        .values({
          id: uid(),
          chat_id: forcedChat,
          actor_id: actorId,
          parent_id: forcedParent,
          role: MessageRole.User,
          content: "blocked",
          content_format: MessageContentFormat.Markdown,
          content_type: MessageContentType.Text,
          content_encoding: "utf8" as ContentEncoding,
          status: MessageStatus.Confirmed,
          visibility: "visible",
          swipe_index: i,
        },)
        .execute();
    }

    // Now MAX = 16, attempt 0 → swipe_index 17 → success.
    // To force exhaustion we need to inject a unique-index violation
    // independent of the swipe_index arithmetic. Use an explicit
    // duplicate id collision as the trigger.
    const dupId = uid();
    // Pre-insert with the same id to force the FIRST attempt to collide.
    await db
      .insertInto("messages",)
      .values({
        id: dupId,
        chat_id: forcedChat,
        actor_id: actorId,
        parent_id: null,
        role: MessageRole.User,
        content: "stub",
        content_format: MessageContentFormat.Markdown,
        content_type: MessageContentType.Text,
        content_encoding: "utf8" as ContentEncoding,
        status: MessageStatus.Confirmed,
        visibility: "visible",
        swipe_index: null,
      },)
      .execute();

    // Now insert with the same id (collides on primary key, retries
    // also collide because the helper re-uses the same id on every attempt).
    await expect(
      insertUserMessageWithRetry(db, {
        ...makeBase(dupId,),
        chatId: forcedChat,
        parentId: null,
      },),
    ).rejects.toBeInstanceOf(SwipeInsertExhaustedError,);
  });
});

describe("swipe-race-insert — idempotency", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let otherChatId: string;
  let actorId: string;
  const idemKey = "unique-key-001";

  beforeAll(async () => {
    ({ db, } = await createTestDb());

    const userId = uid();
    await insertUsers(db, `idem-user-${userId}`, "Idem User", { id: userId, } as never,);
    actorId = userId;
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "user",
        display_name: "Idem Actor",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    chatId = uid();
    otherChatId = uid();
    await insertChats(db, "Idem Chat", actorId, { id: chatId, } as never,);
    await insertChats(db, "Other Idem Chat", actorId, { id: otherChatId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("findByIdempotencyKey returns null when no row exists", async () => {
    const result = await findByIdempotencyKey(db, chatId, idemKey,);
    expect(result,).toBeNull();
  });

  test("after insert with idempotencyKey, findByIdempotencyKey returns that row's id", async () => {
    const rowId = uid();
    await insertUserMessageWithRetry(db, {
      id: rowId,
      chatId,
      actorId,
      parentId: null,
      storedContent: "x",
      storedKeyId: null,
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: idemKey,
    },);

    const result = await findByIdempotencyKey(db, chatId, idemKey,);
    expect(result,).toBe(rowId,);
  });

  test("same idempotencyKey on a different chat is independent", async () => {
    const result = await findByIdempotencyKey(db, otherChatId, idemKey,);
    expect(result,).toBeNull();
  });

  test("null idempotencyKey always returns null and never blocks inserts", async () => {
    const r1 = await findByIdempotencyKey(db, chatId, "",);
    const r2 = await findByIdempotencyKey(db, chatId, "",);
    expect(r1,).toBeNull();
    expect(r2,).toBeNull();
    // Two top-level inserts with no key — both succeed.
    const a = await insertUserMessageWithRetry(db, {
      id: uid(),
      chatId,
      actorId,
      parentId: null,
      storedContent: "a",
      storedKeyId: null,
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: null,
    },);

    const b = await insertUserMessageWithRetry(db, {
      id: uid(),
      chatId,
      actorId,
      parentId: null,
      storedContent: "b",
      storedKeyId: null,
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: null,
    },);

    expect(a.id,).not.toBe(b.id,);
  });
});

describe("swipe-race-insert — DB-enforced dedup (BUG-message-idempotency-key-dedup-not-db-enforced-concurrent-dup)", () => {
  // The check-then-insert in the route has a TOCTOU window; migration 040
  // closes it with `uq_messages_idempotency_enforced` on
  // (chat_id, idempotency_key) WHERE key IS NOT NULL AND key NOT LIKE
  // 'regen:variant:%' AND key NOT LIKE 'turn_skip:%'. These tests pin the
  // schema-level behavior the route replay path depends on.
  //
  // Resource contract (parallel-safe tests):
  //   - this block owns a private in-memory DB (createTestDb in beforeAll,
  //     destroyed in afterAll) — no shared files, ports, or env mutation;
  //   - tests within the block share that DB, but each writes with a
  //     UNIQUE idempotency key (fixed literal or uid()) and every row
  //     count asserts against a key-scoped query, so cross-test row
  //     accumulation cannot poison any assertion;
  //   - no inter-test ordering dependence: each test passes alone.
  let db: Kysely<DB>;
  let chatId: string;
  let actorId: string;

  beforeAll(async () => {
    ({ db, } = await createTestDb());

    const userId = uid();
    await insertUsers(db, `enforced-user-${userId}`, "Enforced User", { id: userId, } as never,);
    actorId = userId;
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "user",
        display_name: "Enforced Actor",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    chatId = uid();
    await insertChats(db, "Enforced Chat", actorId, { id: chatId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  const insertWithKey = (id: string, idempotencyKey: string | null,) =>
    insertUserMessageWithRetry(db, {
      id,
      chatId,
      actorId,
      parentId: null,
      storedContent: "x",
      storedKeyId: null,
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey,
    },);

  test("second insert with the same (chat, key) replays the winner's id", async () => {
    const key = "dedup-enforced-key-1";
    const first = await insertWithKey(uid(), key,);
    const second = await insertWithKey(uid(), key,);

    expect(first.replayedId,).toBeUndefined();
    expect(second.replayedId,).toBe(first.id,);

    // Exactly one row exists for the key: the unique index rejected the
    // loser's INSERT and the helper mapped the violation to a replay.
    const rows = await db
      .selectFrom("messages",)
      .select(["id",],)
      .where("chat_id", "=", chatId,)
      .where("idempotency_key", "=", key,)
      .execute();

    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.id,).toBe(first.id,);
  });

  test("isIdempotencyUniqueViolation matches both driver error forms", () => {
    const text = new Error("UNIQUE constraint failed: messages.chat_id, messages.idempotency_key",);
    const code = new Error("SQLITE_CONSTRAINT_UNIQUE: uq_messages_idempotency_enforced",);
    expect(isIdempotencyUniqueViolation(text,),).toBe(true,);
    expect(isIdempotencyUniqueViolation(code,),).toBe(true,);

    // Unrelated unique violations must NOT be classified as idempotency
    // conflicts (swipe retry and error mapping depend on this).
    const swipe = new Error("UNIQUE constraint failed: messages.swipe_index",);
    const pk = new Error("UNIQUE constraint failed: messages.id",);
    const fk = new Error("FOREIGN KEY constraint failed",);
    expect(isIdempotencyUniqueViolation(swipe,),).toBe(false,);
    expect(isIdempotencyUniqueViolation(pk,),).toBe(false,);
    expect(isIdempotencyUniqueViolation(fk,),).toBe(false,);
    expect(isIdempotencyUniqueViolation("not an error",),).toBe(false,);
    expect(isIdempotencyUniqueViolation(null,),).toBe(false,);
  });

  test("regen:variant keys are exempt from the unique index", async () => {
    // chat/service/write.ts re-inserts the same regen:variant key after the
    // pending variant was confirmed (filled in place, key kept for replay).
    // The index's WHERE clause must keep excluding that family or real
    // regenerations would 500.
    const regenKey = `regen:variant:${uid()}:funnier`;
    const a = await insertWithKey(uid(), regenKey,);
    const b = await insertWithKey(uid(), regenKey,);

    expect(a.replayedId,).toBeUndefined();
    expect(b.replayedId,).toBeUndefined();
    const rows = await db
      .selectFrom("messages",)
      .select(["id",],)
      .where("chat_id", "=", chatId,)
      .where("idempotency_key", "=", regenKey,)
      .execute();

    expect(rows,).toHaveLength(2,);
  });

  test("same key in a different chat inserts fresh (index is chat-scoped)", async () => {
    // The unique index covers (chat_id, idempotency_key): a same-key insert
    // into ANOTHER chat must succeed with replayedId undefined — not be
    // caught by the index and not be misclassified as a replay.
    const otherChat = uid();
    await insertChats(db, "Cross-Chat Enforced", actorId, { id: otherChat, } as never,);

    const key = "chat-scope-key-1";
    const first = await insertUserMessageWithRetry(db, {
      id: uid(),
      chatId,
      actorId,
      parentId: null,
      storedContent: "chat a",
      storedKeyId: null,
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: key,
    },);

    const second = await insertUserMessageWithRetry(db, {
      id: uid(),
      chatId: otherChat,
      actorId,
      parentId: null,
      storedContent: "chat b",
      storedKeyId: null,
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: key,
    },);

    expect(first.replayedId,).toBeUndefined();
    expect(second.replayedId,).toBeUndefined();

    const rows = await db
      .selectFrom("messages",)
      .select(["id", "chat_id",],)
      .where("idempotency_key", "=", key,)
      .execute();

    expect(rows,).toHaveLength(2,);
    expect(new Set(rows.map((r,) => r.chat_id),).size,).toBe(2,);
  });

  test("replayedId propagates through insertUserMessageRow (route contract)", async () => {
    // Concurrency-free proof of the FULL propagation chain: a pre-existing
    // row covering the key makes the loser's INSERT hit migration 040's
    // unique index inside insertUserMessageRow; the violation must come
    // back as ok:true + replayedId = the winner's id, not a 500.
    const key = "propagation-key-1";
    const winnerId = uid();
    await insertWithKey(winnerId, key,);

    const loserId = uid();
    const outcome = await insertUserMessageRow({
      database: db,
      chatId,
      actorId,
      id: loserId,
      parentId: null,
      storedContent: "loser",
      storedKeyId: null,
      storedPlaintext: null,
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: key,
      setStatus: () => {},
    },);

    expect(outcome.ok,).toBe(true,);
    if (outcome.ok) {
      expect(outcome.replayedId,).toBe(winnerId,);
    }

    // Still exactly one row for the key.
    const rows = await db
      .selectFrom("messages",)
      .select(["id",],)
      .where("idempotency_key", "=", key,)
      .execute();

    expect(rows,).toHaveLength(1,);
  });

  test("turn_skip keys are exempt from the unique index", async () => {
    // chat/service/crud/turn-skip.ts minute-bucket keys collide across
    // buckets by design; dedup there is the latest-message guard.
    const skipKey = `turn_skip:${chatId}:${actorId}:advance:0`;
    await insertWithKey(uid(), skipKey,);
    const b = await insertWithKey(uid(), skipKey,);

    expect(b.replayedId,).toBeUndefined();
    const rows = await db
      .selectFrom("messages",)
      .select(["id",],)
      .where("chat_id", "=", chatId,)
      .where("idempotency_key", "=", skipKey,)
      .execute();

    expect(rows,).toHaveLength(2,);
  });
});
