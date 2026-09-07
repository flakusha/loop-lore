// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/auto-gen/fire-random-event.ts — ambient event
 * firing + persistence into chat_random_events.
 *
 * The pool's minimum `minMessages` is 5, so a chat with zero messages
 * never fires (null path); a chat with many messages always fires.
 * The conflict-upsert branch needs a repeated event_id, which the
 * generator derives from a random uid — not reachable deterministically.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Database, } from "bun:sqlite";
import type { DB, } from "../../db/schema";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { fireRandomEvent, } from "./fire-random-event";

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

/** Seed user + world + location + two chats (with / without location). */
async function seedBase(): Promise<void> {
  resetTestDb(sqlite,);
  await db.insertInto("users",).values({
    id: "user-1",
    username: "test",
    display_name: "Test",
    role: "user",
    status: "active",
    settings: "{}",
  },).execute();
  await db.insertInto("worlds",).values({
    id: "world-1",
    owner_id: "user-1",
    name: "Test World",
  },).execute();
  await db.insertInto("locations",).values({
    id: "loc-1",
    world_id: "world-1",
    name: "Old Forest",
  },).execute();
  await db.insertInto("chats",).values({
    id: "chat-rich",
    name: "Rich Chat",
    type: "direct",
    mode: "direct",
    created_by: "user-1",
    current_location_id: "loc-1",
  },).execute();
  await db.insertInto("chats",).values({
    id: "chat-empty",
    name: "Empty Chat",
    type: "direct",
    mode: "direct",
    created_by: "user-1",
  },).execute();
  await db.insertInto("actors",).values({
    id: "actor-1",
    actor_type: "character",
    display_name: "Lyra",
    agent_type: "ai",
    settings: "{}",
    format_version: 0,
    import_spec: "{}",
  },).execute();
  await db.insertInto("chat_participants",).values({
    chat_id: "chat-rich",
    actor_id: "actor-1",
  },).execute();
}

/** Insert `count` filler messages into a chat. */
async function seedMessages(chatId: string, count: number,): Promise<void> {
  for (let i = 0; i < count; i++) {
    await db.insertInto("messages",).values({
      id: `msg-${chatId}-${i}`,
      chat_id: chatId,
      actor_id: "actor-1",
      role: "assistant",
      content: `filler ${i}`,
      content_type: "text",
      content_format: "markdown",
      content_encoding: "identity",
      status: "confirmed",
      visibility: "visible",
    },).execute();
  }
}

describe("fireRandomEvent", () => {
  it("returns null for a chat below every event's message threshold", async () => {
    await seedBase();
    const result = await fireRandomEvent(db, "chat-empty",);
    expect(result,).toBeNull();

    const rows = await db
      .selectFrom("chat_random_events",)
      .selectAll()
      .where("chat_id", "=", "chat-empty",)
      .execute();
    expect(rows,).toEqual([],);
  });

  it("fires an event for an active chat and persists it", async () => {
    await seedBase();
    await seedMessages("chat-rich", 10,);

    const result = await fireRandomEvent(db, "chat-rich",);
    expect(result,).not.toBeNull();
    const { event, eventRef, } = result!;
    expect(event.id,).toBe(eventRef.eventId,);
    expect(event.content.length,).toBeGreaterThan(0,);
    expect(eventRef.type,).toBe("random",);
    expect(eventRef.tokenCount,).toBe(Math.ceil(event.content.length / 4,),);

    const rows = await db
      .selectFrom("chat_random_events",)
      .selectAll()
      .where("chat_id", "=", "chat-rich",)
      .execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.event_id,).toBe(event.id,);
    expect(rows[0]?.content,).toBe(event.content,);
    expect(rows[0]?.fired_count,).toBe(1,);
    expect(rows[0]?.expires_at,).toBeGreaterThan(rows[0]?.fired_at ?? 0,);
  });

  it("persists a second fired event as its own row", async () => {
    await seedBase();
    await seedMessages("chat-rich", 10,);

    const first = await fireRandomEvent(db, "chat-rich",);
    const second = await fireRandomEvent(db, "chat-rich",);
    expect(first,).not.toBeNull();
    expect(second,).not.toBeNull();

    const rows = await db
      .selectFrom("chat_random_events",)
      .selectAll()
      .where("chat_id", "=", "chat-rich",)
      .execute();
    expect(rows.length,).toBe(2,);
  });
});
