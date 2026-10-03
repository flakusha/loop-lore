// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Dispatch behaviour for scheduled messages + reminders
 * (TASK-scheduled-messages-reminders).
 *
 * Each test asserts a boundary the dispatcher could plausibly get wrong:
 * due vs not-yet-due, the quiet-hours hold, a canceled row, and the
 * exactly-once reminder fire.
 */
import { beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { initSmk, } from "../../crypto";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { dispatchDue, } from "./dispatcher";
import { createReminder, } from "./reminders";
import { scheduleMessage, } from "./scheduled-messages";

/** Minimal config for the storage pipeline (only encryption tuning is read). */
const testConfig = {
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip", },
} as unknown as Config;

const VALID_HEX_KEY = "a".repeat(64,);

const MINUTE = 60_000;

/** @param minutes */
function isoIn(minutes: number,): string {
  return new Date(Date.now() + minutes * MINUTE,).toISOString();
}

/** Quiet hours that definitely contain `now`, as a 24h wrap window. */
function alwaysQuietWindow(now: Date,): { start: string; end: string } {
  const hhmm = (d: Date,): string =>
    `${String(d.getHours(),).padStart(2, "0",)}:${String(d.getMinutes(),).padStart(2, "0",)}`;
  const start = new Date(now.getTime() - 60 * MINUTE,);
  const end = new Date(now.getTime() + 60 * MINUTE,);
  return { start: hhmm(start,), end: hhmm(end,), };
}

describe("dispatchDue — scheduled messages", () => {
  let db: Kysely<DB>;
  let userId: string;
  let chatId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    userId = uid();
    await insertUsers(db, userId, "Scheduler", { id: userId as never, },);
    await insertActors(db, "Scheduler Actor", { id: userId as never, actor_type: "user" as never, },);
    chatId = uid();
    await insertChats(db, "Scheduled Chat", userId, { id: chatId as never, },);
  },);

  /** @param opts @param opts.body @param opts.minutes */
  async function park(opts: { body: string; minutes: number },): Promise<string> {
    const result = await scheduleMessage(db, {
      chatId,
      authorId: userId,
      body: opts.body,
      sendAt: isoIn(opts.minutes,),
    },);
    if (!("ok" in result)) { throw new Error(`park failed: ${result.message}`,); }
    return result.scheduled.id;
  }

  /** @param body */
  async function messageCount(body: string,): Promise<number> {
    const rows = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .where("content", "=", body,)
      .execute();
    return rows.length;
  }

  test("a due message is delivered and marked sent", async () => {
    await park({ body: "due now", minutes: -1, },);

    const summary = await dispatchDue(db, testConfig,);

    expect(summary.sent,).toBe(1,);
    expect(await messageCount("due now",),).toBe(1,);
    const row = await db
      .selectFrom("scheduled_messages",)
      .select("status",)
      .executeTakeFirst();
    expect(row?.status,).toBe("sent",);
  });

  test("a message that is not yet due is left pending and undelivered", async () => {
    await park({ body: "later", minutes: 30, },);

    const summary = await dispatchDue(db, testConfig,);

    expect(summary.sent,).toBe(0,);
    expect(await messageCount("later",),).toBe(0,);
    const row = await db
      .selectFrom("scheduled_messages",)
      .select("status",)
      .executeTakeFirst();
    expect(row?.status,).toBe("pending",);
  });

  test("a due message inside quiet hours is HELD, then delivered after the boundary", async () => {
    const now = new Date();
    const { start, end, } = alwaysQuietWindow(now,);
    await db
      .insertInto("proactive_messaging_config",)
      .values({
        id: uid(),
        chat_id: chatId,
        actor_id: userId,
        frequency: "normal",
        quiet_hours_start: start,
        quiet_hours_end: end,
        enabled: 1,
        last_proactive_at: null,
        backoff_count: 0,
        config_json: "{}",
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },)
      .execute();

    // A past-due row: due right now, i.e. inside the quiet window.
    await park({ body: "held", minutes: -1, },);

    const held = await dispatchDue(db, testConfig, { now, },);
    expect(held.held,).toBe(1,);
    expect(held.sent,).toBe(0,);
    // Held, not dropped: still pending and still undelivered.
    expect(await messageCount("held",),).toBe(0,);
    const stillPending = await db
      .selectFrom("scheduled_messages",)
      .select("status",)
      .executeTakeFirst();
    expect(stillPending?.status,).toBe("pending",);

    // One minute past the window's end the same row goes out.
    const after = new Date(now.getTime() + 61 * MINUTE,);
    const delivered = await dispatchDue(db, testConfig, { now: after, },);
    expect(delivered.sent,).toBe(1,);
    expect(await messageCount("held",),).toBe(1,);
  });

  test("a canceled message never sends, even once it is past due", async () => {
    const id = await park({ body: "withdrawn", minutes: -1, },);
    await db
      .updateTable("scheduled_messages",)
      .set({ status: "canceled", },)
      .where("id", "=", id,)
      .execute();

    const summary = await dispatchDue(db, testConfig,);

    expect(summary.sent,).toBe(0,);
    expect(await messageCount("withdrawn",),).toBe(0,);
  });

  test("a second pass does not re-deliver an already-sent message", async () => {
    await park({ body: "once", minutes: -1, },);

    const first = await dispatchDue(db, testConfig,);
    const second = await dispatchDue(db, testConfig,);

    expect(first.sent,).toBe(1,);
    expect(second.sent,).toBe(0,);
    expect(await messageCount("once",),).toBe(1,);
  });

  test("a crash between insert and status-update does not deliver the message twice", async () => {
    const rowId = await park({ body: "exactly once", minutes: -1, },);
    // Stand in for the crash window: the message landed and carries the
    // dispatcher's idempotency key, but the scheduled row is still pending.
    await insertMessages(db, chatId, userId, "user", "exactly once", {
      idempotency_key: `scheduled:${rowId}`,
    },);

    const summary = await dispatchDue(db, testConfig,);

    // The key is already claimed, so nothing new is written and the row heals.
    expect(summary.sent,).toBe(0,);
    expect(summary.failed,).toBe(0,);
    expect(await messageCount("exactly once",),).toBe(1,);
    const row = await db
      .selectFrom("scheduled_messages",)
      .select("status",)
      .where("id", "=", rowId,)
      .executeTakeFirst();
    expect(row?.status,).toBe("sent",);
  });
});

describe("dispatchDue — per-row failure isolation", () => {
  let db: Kysely<DB>;
  let userId: string;
  let chatId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    userId = uid();
    await insertUsers(db, userId, "Deliverer", { id: userId as never, },);
    await insertActors(db, "Deliverer Actor", { id: userId as never, actor_type: "user" as never, },);
    chatId = uid();
    await insertChats(db, "Isolation Chat", userId, { id: chatId as never, },);
  },);

  /** @param authorId @param body @param minutes */
  async function parkAs(
    authorId: string,
    body: string,
    minutes: number,
  ): Promise<string> {
    const result = await scheduleMessage(db, {
      chatId,
      authorId,
      body,
      sendAt: isoIn(minutes,),
    },);
    if (!("ok" in result)) { throw new Error(`park failed: ${result.message}`,); }
    return result.scheduled.id;
  }

  test("a poison row does not starve the rows queued behind it", async () => {
    // A user with no `actors` row: `messages.actor_id` is a foreign key, so
    // the insert exhausts its retries and throws. That is the real-world
    // poison case (an actor row removed mid-flight), not a stubbed failure.
    const ghostId = uid();
    await insertUsers(db, ghostId, "Ghost", { id: ghostId as never, },);
    // Ordered first by send_at ASC, so it is the row that fails the pass.
    const poisonId = await parkAs(ghostId, "poison", -5,);
    const healthyId = await parkAs(userId, "healthy", -1,);

    const summary = await dispatchDue(db, testConfig,);

    // The pass survived the throw and went on to the next due row.
    expect(summary.sent,).toBe(1,);
    expect(summary.failed,).toBe(1,);
    const delivered = await db
      .selectFrom("messages",)
      .select("content",)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(delivered.map((m,) => m.content),).toEqual(["healthy",],);

    // The failed row is still pending — retried next tick, never dropped,
    // never silently marked sent.
    const statuses = await db
      .selectFrom("scheduled_messages",)
      .select(["id", "status",],)
      .execute();
    expect(statuses.find((r,) => r.id === poisonId)?.status,).toBe("pending",);
    expect(statuses.find((r,) => r.id === healthyId)?.status,).toBe("sent",);
  });
});

describe("dispatchDue — reminders", () => {
  let db: Kysely<DB>;
  let userId: string;
  let chatId: string;
  let messageId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    userId = uid();
    await insertUsers(db, userId, "Reminded", { id: userId as never, },);
    await insertActors(db, "Reminded Actor", { id: userId as never, actor_type: "user" as never, },);
    chatId = uid();
    await insertChats(db, "Reminder Chat", userId, { id: chatId as never, },);
    messageId = uid();
    await insertMessages(db, chatId, userId, "user", "read me later", { id: messageId as never, },);
  },);

  /** @param userId */
  async function notificationCount(userId: string,): Promise<number> {
    const rows = await db
      .selectFrom("notifications",)
      .select("id",)
      .where("user_id", "=", userId,)
      .execute();
    return rows.length;
  }

  test("a due reminder fires exactly once across two passes", async () => {
    const created = await createReminder(db, { messageId, userId, remindAt: isoIn(-1,), },);
    if (!("ok" in created)) { throw new Error(`createReminder failed: ${created.message}`,); }

    const first = await dispatchDue(db, testConfig,);
    const second = await dispatchDue(db, testConfig,);

    expect(first.reminded,).toBe(1,);
    expect(second.reminded,).toBe(0,);
    expect(await notificationCount(userId,),).toBe(1,);
  });

  test("a reminder that is not yet due does not fire and stays armed", async () => {
    await createReminder(db, { messageId, userId, remindAt: isoIn(30,), },);

    const summary = await dispatchDue(db, testConfig,);

    expect(summary.reminded,).toBe(0,);
    expect(await notificationCount(userId,),).toBe(0,);
    const armed = await db.selectFrom("message_reminders",).select("id",).execute();
    expect(armed.length,).toBe(1,);
  });

  test("re-arming the same message replaces the horizon rather than duplicating", async () => {
    await createReminder(db, { messageId, userId, remindAt: isoIn(60,), },);
    const second = await createReminder(db, { messageId, userId, remindAt: isoIn(-1,), },);
    if (!("ok" in second)) { throw new Error(`re-arm failed: ${second.message}`,); }

    const rows = await db.selectFrom("message_reminders",).select("id",).execute();
    expect(rows.length,).toBe(1,);

    const summary = await dispatchDue(db, testConfig,);
    expect(summary.reminded,).toBe(1,);
  });
});

describe("dispatchDue — at-rest encryption", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let userId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    userId = uid();
    await insertUsers(db, userId, "Secret Keeper", { id: userId as never, },);
    await insertActors(db, "Secret Keeper", { id: userId as never, actor_type: "user" as never, },);
    chatId = uid();
    await insertChats(db, "Encrypted Chat", userId, {
      id: chatId as never,
      encryption_level: "standard",
    } as never,);
  },);

  test("a dispatched body is encrypted at rest, never stored plaintext", async () => {
    await initSmk({
      serverEncryptionKey: VALID_HEX_KEY,
      required: false,
      compressThreshold: 1024,
      compressAlgorithm: "gzip",
    },);
    try {
      const parked = await scheduleMessage(db, {
        chatId,
        authorId: userId,
        body: "the launch codes are here",
        sendAt: new Date(Date.now() - 60_000,).toISOString(),
      },);
      if (!("ok" in parked)) { throw new Error(`park failed: ${parked.message}`,); }

      const summary = await dispatchDue(db, testConfig,);
      expect(summary.sent,).toBe(1,);

      const row = await db
        .selectFrom("messages",)
        .select(["content", "key_id", "content_plaintext",],)
        .where("chat_id", "=", chatId,)
        .executeTakeFirst();

      // The confidentiality property: the body is NOT sitting in the clear.
      expect(row?.content,).not.toBe("the launch codes are here",);
      expect(row?.content,).not.toContain("the launch codes are here",);
      expect(row?.key_id,).not.toBeNull();
      // FTS5 still needs a plaintext shadow for at-rest-encrypted chats.
      expect(row?.content_plaintext,).toBe("the launch codes are here",);
    } finally {
      // Reset the SMK global so later suites do not inherit an active key.
      await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
    }
  });

  test("an unencrypted chat still stores the body verbatim", async () => {
    const plainChat = uid();
    await insertChats(db, "Plain Chat", userId, { id: plainChat as never, },);
    const parked = await scheduleMessage(db, {
      chatId: plainChat,
      authorId: userId,
      body: "nothing secret",
      sendAt: new Date(Date.now() - 60_000,).toISOString(),
    },);
    if (!("ok" in parked)) { throw new Error(`park failed: ${parked.message}`,); }

    const summary = await dispatchDue(db, testConfig,);
    expect(summary.sent,).toBe(1,);

    const row = await db
      .selectFrom("messages",)
      .select(["content", "key_id",],)
      .where("chat_id", "=", plainChat,)
      .executeTakeFirst();
    expect(row?.content,).toBe("nothing secret",);
    expect(row?.key_id,).toBeNull();
  });
});
