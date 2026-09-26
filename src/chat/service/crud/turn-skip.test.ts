// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Turn-skip event persistence tests (TASK-turn-skip-event-and-persistence).
 *
 * A skip is a first-class system message with content_type=turn_skip; dedup
 * rides the latest-turn_skip replay guard (same actor + chat, latest row
 * with content_type=turn_skip returns `deduped: true`). The unique-index
 * retry path was removed — messages.idempotency_key is a plain index, so
 * concurrent retries within the minute bucket are not deduplicated by the
 * schema; the latest-message guard only catches sequential retries.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageContentType, MessageRole, MessageStatus, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { countTurnSkipsForActor, recordTurnSkip, } from "./turn-skip";
describe("recordTurnSkip", () => {
  let db: Kysely<DB>;
  const OWNER_ID = crypto.randomUUID();
  const MEMBER_ID = crypto.randomUUID();
  const OUTSIDER_ID = crypto.randomUUID();
  const CHAT_ID = crypto.randomUUID();

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    for (const [name, id,] of [["owner", OWNER_ID,], ["member", MEMBER_ID,], ["outsider", OUTSIDER_ID,],] as const) {
      await insertUsers(db, name, name, { id, } as never,);
      await insertActors(db, name, { id, user_id: id, owner_id: id, } as never,);
    }
    await insertChats(db, "Skip Chat", OWNER_ID, { id: CHAT_ID, } as never,);
    await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: "owner", },);
    await insertChatParticipants(db, CHAT_ID, MEMBER_ID, { role_in_chat: "member", },);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("records a turn_skip system message with mode metadata", async () => {
    const res = await recordTurnSkip(db, {
      chatId: CHAT_ID,
      actorId: MEMBER_ID,
      mode: "hold",
      reason: "brb",
      userId: MEMBER_ID,
      userRole: null,
    },);
    expect(res.ok,).toBe(true,);
    if (!res.ok) { return; }
    expect(res.deduped,).toBe(false,);
    const row = await db.selectFrom("messages",).selectAll().where("id", "=", res.messageId,).executeTakeFirst();
    expect(row?.role,).toBe(MessageRole.System,);
    expect(row?.content_type,).toBe(MessageContentType.TurnSkip,);
    expect(row?.status,).toBe(MessageStatus.Confirmed,);
    expect(row?.content,).toContain("hold",);
    expect(row?.content,).toContain("brb",);
    expect(JSON.parse(row?.metadata ?? "{}",),).toEqual({ turnSkip: { mode: "hold", reason: "brb", }, },);
  });

  test("retry within the dedup window replays the stored row", async () => {
    const first = await recordTurnSkip(db, {
      chatId: CHAT_ID,
      actorId: MEMBER_ID,
      mode: "advance",
      userId: MEMBER_ID,
      userRole: null,
    },);
    const second = await recordTurnSkip(db, {
      chatId: CHAT_ID,
      actorId: MEMBER_ID,
      mode: "advance",
      userId: MEMBER_ID,
      userRole: null,
    },);
    expect(first.ok && second.ok,).toBe(true,);
    if (!first.ok || !second.ok) { return; }
    expect(second.deduped,).toBe(true,);
    expect(second.messageId,).toBe(first.messageId,);
    const rows = await db.selectFrom("messages",).select("id",)
      .where("chat_id", "=", CHAT_ID,).where("content_type", "=", MessageContentType.TurnSkip,).execute();
    expect(rows,).toHaveLength(1,);
  });

  test("unknown chat -> not_found", async () => {
    const res = await recordTurnSkip(db, {
      chatId: crypto.randomUUID(),
      actorId: MEMBER_ID,
      mode: "hold",
      userId: MEMBER_ID,
      userRole: null,
    },);
    expect(res,).toEqual({ ok: false, code: "not_found", message: "Chat not found", },);
  });

  test("non-participant actor -> not_found", async () => {
    const res = await recordTurnSkip(db, {
      chatId: CHAT_ID,
      actorId: OUTSIDER_ID,
      mode: "hold",
      userId: OWNER_ID,
      userRole: null,
    },);
    expect(res.ok,).toBe(false,);
    if (res.ok) { return; }
    expect(res.code,).toBe("not_found",);
  });

  test("soft-refused latest beat cannot be skipped (refused_beat)", async () => {
    await insertMessages(db, CHAT_ID, MEMBER_ID, MessageRole.User, "attempted beat", {
      status: MessageStatus.Rejected,
    },);
    const res = await recordTurnSkip(db, {
      chatId: CHAT_ID,
      actorId: MEMBER_ID,
      mode: "hold",
      userId: MEMBER_ID,
      userRole: null,
    },);
    expect(res.ok,).toBe(false,);
    if (res.ok) { return; }
    expect(res.code,).toBe("refused_beat",);
  });
});

describe("cascade telemetry (TASK-turn-skip-cascade)", () => {
  let db: Kysely<DB>;
  const OWNER_ID = crypto.randomUUID();
  const MEMBER_ID = crypto.randomUUID();
  const CHAT_ID = crypto.randomUUID();

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    for (const [name, id,] of [["owner", OWNER_ID,], ["member", MEMBER_ID,],] as const) {
      await insertUsers(db, name, name, { id, } as never,);
      await insertActors(db, name, { id, user_id: id, owner_id: id, } as never,);
    }
    await insertChats(db, "Cascade Chat", OWNER_ID, { id: CHAT_ID, } as never,);
    await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: "owner", },);
    await insertChatParticipants(db, CHAT_ID, MEMBER_ID, { role_in_chat: "member", },);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  async function telemetryEvents(eventType: string,): Promise<Array<{ event_data: string }>> {
    return db.selectFrom("telemetry_events",).select("event_data",)
      .where("event_type", "=", eventType,).execute();
  }

  test("fresh skip records cascade.beat.consumed telemetry", async () => {
    const res = await recordTurnSkip(db, {
      chatId: CHAT_ID,
      actorId: MEMBER_ID,
      mode: "hold",
      userId: MEMBER_ID,
      userRole: null,
    },);
    expect(res.ok,).toBe(true,);
    const events = await telemetryEvents("cascade.beat.consumed",);
    expect(events.length,).toBeGreaterThanOrEqual(1,);
  });

  test("deduped skip records cascade.dedup.skip telemetry", async () => {
    const first = await recordTurnSkip(db, {
      chatId: CHAT_ID,
      actorId: MEMBER_ID,
      mode: "hold",
      userId: MEMBER_ID,
      userRole: null,
    },);
    expect(first.ok,).toBe(true,);
    const second = await recordTurnSkip(db, {
      chatId: CHAT_ID,
      actorId: MEMBER_ID,
      mode: "hold",
      userId: MEMBER_ID,
      userRole: null,
    },);
    expect(second.ok,).toBe(true,);
    if (!second.ok) { return; }
    expect(second.deduped,).toBe(true,);
    const events = await telemetryEvents("cascade.dedup.skip",);
    expect(events.length,).toBeGreaterThanOrEqual(1,);
  });

  test("refused_beat does not record any telemetry", async () => {
    await insertMessages(db, CHAT_ID, MEMBER_ID, MessageRole.User, "attempted beat", {
      status: MessageStatus.Rejected,
    },);
    const res = await recordTurnSkip(db, {
      chatId: CHAT_ID,
      actorId: MEMBER_ID,
      mode: "hold",
      userId: MEMBER_ID,
      userRole: null,
    },);
    expect(res.ok,).toBe(false,);
    const consumed = await telemetryEvents("cascade.beat.consumed",);
    const dedup = await telemetryEvents("cascade.dedup.skip",);
    expect(consumed,).toHaveLength(0,);
    expect(dedup,).toHaveLength(0,);
  });
});

describe("countTurnSkipsForActor (TASK-turn-skip-cascade)", () => {
  let db: Kysely<DB>;
  const OWNER_ID = crypto.randomUUID();
  const MEMBER_ID = crypto.randomUUID();
  const CHAT_ID = crypto.randomUUID();

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    for (const [name, id,] of [["owner", OWNER_ID,], ["member", MEMBER_ID,],] as const) {
      await insertUsers(db, name, name, { id, } as never,);
      await insertActors(db, name, { id, user_id: id, owner_id: id, } as never,);
    }
    await insertChats(db, "Count Chat", OWNER_ID, { id: CHAT_ID, } as never,);
    await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: "owner", },);
    await insertChatParticipants(db, CHAT_ID, MEMBER_ID, { role_in_chat: "member", },);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("returns 0 when no skips exist", async () => {
    const n = await countTurnSkipsForActor(db, CHAT_ID, MEMBER_ID,);
    expect(n,).toBe(0,);
  });

  test("counts skips per actor and ignores other actors", async () => {
    // Each owner skip needs a non-skip row in between; the latest-message
    // dedup guard short-circuits a back-to-back skip regardless of mode
    // (see turn-skip.ts:99-113). Realistic flow: actor skips, the GM
    // produces a beat, the actor skips again.
    await recordTurnSkip(db, {
      chatId: CHAT_ID,
      actorId: MEMBER_ID,
      mode: "hold",
      userId: MEMBER_ID,
      userRole: null,
    },);
    await recordTurnSkip(db, {
      chatId: CHAT_ID,
      actorId: OWNER_ID,
      mode: "advance",
      userId: OWNER_ID,
      userRole: null,
    },);
    // Owner emits a non-skip message (e.g. a confirmed beat) → next owner
    // skip is no longer deduped against the prior skip row.
    await insertMessages(db, CHAT_ID, OWNER_ID, MessageRole.Character, "Meanwhile, the captain stood watch.",);
    await recordTurnSkip(db, {
      chatId: CHAT_ID,
      actorId: OWNER_ID,
      mode: "hold",
      userId: OWNER_ID,
      userRole: null,
    },);
    const memberCount = await countTurnSkipsForActor(db, CHAT_ID, MEMBER_ID,);
    const ownerCount = await countTurnSkipsForActor(db, CHAT_ID, OWNER_ID,);
    expect(memberCount,).toBe(1,);
    expect(ownerCount,).toBe(2,);
  });
});
