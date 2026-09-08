// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for `NpcMovementIndicatorService`
 * (src/chat/npc-movement/index.ts).
 *
 * Contract: movement events merge into existing message metadata (never
 * clobbering sibling keys); queries filter by chat, actor, since, and limit.
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
  insertUsers,
} from "../../test-utils/insert-helpers";
import { NpcMovementIndicatorService, } from "./index";

describe("NpcMovementIndicatorService", () => {
  let db: Kysely<DB>;
  let service: NpcMovementIndicatorService;
  const userId = crypto.randomUUID();
  const actorA = crypto.randomUUID();
  const actorB = crypto.randomUUID();
  const chatId = crypto.randomUUID();
  let msgA: string;
  let msgB: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    service = new NpcMovementIndicatorService(db,);

    await insertUsers(db, "npc-move-user", "Npc Move User", { id: userId, } as never,);
    await insertActors(db, "Mover A", { id: actorA, owner_id: userId, } as never,);
    await insertActors(db, "Mover B", { id: actorB, owner_id: userId, } as never,);
    await insertChats(db, "Move Chat", userId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, actorA, {},);
    await insertChatParticipants(db, chatId, actorB, {},);

    msgA = crypto.randomUUID();
    msgB = crypto.randomUUID();
    await insertMessages(db, chatId, actorA, "assistant", "scene one", {
      id: msgA,
      created_at: "2026-01-01T10:00:00Z",
    } as never,);
    await insertMessages(db, chatId, actorB, "assistant", "scene two", {
      id: msgB,
      created_at: "2026-01-02T10:00:00Z",
      metadata: JSON.stringify({
        movement: [{
          actorId: actorB,
          fromLocationId: "loc-1",
          toLocationId: "loc-2",
          pattern: "patrol",
          timestamp: "2026-01-02T09:59:00Z",
        },],
      },),
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("storeMovementEvents merges into existing metadata without clobbering", async () => {
    await service.storeMovementEvents(msgA, [{
      actorId: actorA,
      fromLocationId: "loc-0",
      toLocationId: "loc-1",
      pattern: "wander",
      timestamp: "2026-01-01T09:55:00Z",
    },],);

    const row = await db
      .selectFrom("messages",).select("metadata",)
      .where("id", "=", msgA,).executeTakeFirstOrThrow();
    const parsed = JSON.parse(row.metadata as string,) as {
      movement: Array<{ actorId: string; pattern: string }>;
    };
    expect(parsed.movement,).toHaveLength(1,);
    expect(parsed.movement[0]?.actorId,).toBe(actorA,);

    // Second store appends, keeping the first event.
    await service.storeMovementEvents(msgA, [{
      actorId: actorA,
      fromLocationId: "loc-1",
      toLocationId: "loc-3",
      pattern: "flee",
      timestamp: "2026-01-01T10:05:00Z",
    },],);
    const again = await db
      .selectFrom("messages",).select("metadata",)
      .where("id", "=", msgA,).executeTakeFirstOrThrow();
    const parsedAgain = JSON.parse(again.metadata as string,) as {
      movement: Array<{ pattern: string }>;
    };
    expect(parsedAgain.movement.map((m,) => m.pattern),).toEqual(["wander", "flee",],);
  });

  test("getMovementEvents returns events across the chat", async () => {
    const events = await service.getMovementEvents({ chatId, },);
    expect(events,).toHaveLength(3,);
  });

  test("filters by actorId", async () => {
    const events = await service.getMovementEvents({ chatId, actorId: actorB, },);
    expect(events,).toHaveLength(1,);
    expect(events[0]?.actorId,).toBe(actorB,);
  });

  test("filters by since (created_at of the message)", async () => {
    const events = await service.getMovementEvents({ chatId, since: "2026-01-01T12:00:00Z", },);
    // Only msgB (created 2026-01-02) qualifies; msgA was created 2026-01-01.
    expect(events.every((e,) => e.actorId === actorB),).toBe(true,);
    expect(events,).toHaveLength(1,);
  });

  test("limit bounds the number of messages scanned", async () => {
    const events = await service.getMovementEvents({ chatId, limit: 1, },);
    // Only one message's events are returned regardless of event count.
    const actors = new Set(events.map((e,) => e.actorId),);
    expect(actors.size,).toBe(1,);
  });

  test("getRecentMovements delegates with default limit", async () => {
    const events = await service.getRecentMovements(chatId,);
    expect(events.length,).toBeGreaterThan(0,);
    expect(events.length,).toBeLessThanOrEqual(20,);
  });
});
