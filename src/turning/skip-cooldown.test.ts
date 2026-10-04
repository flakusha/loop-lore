// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Skip-cooldown tests (AC4/AC6 of TASK-chat-feature-turn-talkativity-skip).
 *
 * The cooldown is derived from persisted `turn_skip` message rows, so these
 * tests seed the messages log directly with controlled `created_at` values —
 * covering both timestamp formats the column carries (SQLite
 * `datetime('now')` space format and ISO-8601).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageContentType, MessageRole, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { fetchSkipCooldowns, SKIP_COOLDOWN_MS, } from "./skip-cooldown";

let db: Kysely<DB>;
const NOW = Date.parse("2026-06-15T12:00:00.000Z",);
let ownerId: string;
let chatId: string;
let alice: string;
let bob: string;

/** Persist a turn_skip event for an actor at a controlled time. */
async function skipFor(actorId: string, atMs: number,): Promise<void> {
  await insertMessages(
    db,
    chatId,
    actorId,
    MessageRole.System,
    "skips this beat (hold)",
    {
      content_type: MessageContentType.TurnSkip,
      created_at: new Date(atMs,).toISOString(),
    },
  );
}

describe("fetchSkipCooldowns", () => {
  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    ownerId = uid();
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    chatId = uid();
    await insertChats(db, "Cooldown Chat", ownerId, { id: chatId, } as never,);
    alice = uid();
    bob = uid();
    await insertActors(db, "Alice", { id: alice, agent_type: "ai", } as never,);
    await insertActors(db, "Bob", { id: bob, agent_type: "ai", } as never,);
    await insertChatParticipants(db, chatId, alice,);
    await insertChatParticipants(db, chatId, bob,);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("fresh skip cools that actor only", async () => {
    await skipFor(alice, NOW - 5_000,);
    const cooling = await fetchSkipCooldowns(db, chatId, { now: NOW, },);
    expect(cooling.has(alice,),).toBe(true,);
    expect(cooling.has(bob,),).toBe(false,);
  });

  test("skip older than the window is re-eligible", async () => {
    await skipFor(alice, NOW - SKIP_COOLDOWN_MS - 1_000,);
    const cooling = await fetchSkipCooldowns(db, chatId, { now: NOW, },);
    expect(cooling.size,).toBe(0,);
  });

  test("later non-skip activity voids the cooldown", async () => {
    await skipFor(alice, NOW - 10_000,);
    await insertMessages(
      db,
      chatId,
      alice,
      MessageRole.Assistant,
      "I spoke again after sitting out",
      { created_at: new Date(NOW - 5_000,).toISOString(), },
    );

    const cooling = await fetchSkipCooldowns(db, chatId, { now: NOW, },);
    expect(cooling.has(alice,),).toBe(false,);
  });

  test("SQLite space-format created_at rows still cool the actor", async () => {
    // `datetime('now')` default: "YYYY-MM-DD HH:MM:SS" in UTC — no T/Z.
    const spaceStamp = new Date(NOW - 5_000,).toISOString().slice(0, 19,).replace("T", " ",);
    await insertMessages(
      db,
      chatId,
      alice,
      MessageRole.System,
      "skips this beat (hold)",
      {
        content_type: MessageContentType.TurnSkip,
        created_at: spaceStamp,
      },
    );

    const cooling = await fetchSkipCooldowns(db, chatId, { now: NOW, },);
    expect(cooling.has(alice,),).toBe(true,);
  });

  test("only the actor's latest skip counts; older skips are ignored", async () => {
    // Insertion order mirrors production: older event first, fresh one after.
    await skipFor(alice, NOW - SKIP_COOLDOWN_MS - 60_000,);
    await skipFor(alice, NOW - 2_000,);
    const cooling = await fetchSkipCooldowns(db, chatId, { now: NOW, },);
    expect(cooling.has(alice,),).toBe(true,);
  });

  test("skips in other chats never leak into this chat", async () => {
    const otherChat = uid();
    await insertChats(db, "Other", ownerId, { id: otherChat, } as never,);
    await insertChatParticipants(db, otherChat, alice,);
    await insertMessages(
      db,
      otherChat,
      alice,
      MessageRole.System,
      "skips this beat (hold)",
      {
        content_type: MessageContentType.TurnSkip,
        created_at: new Date(NOW - 1_000,).toISOString(),
      },
    );

    const cooling = await fetchSkipCooldowns(db, chatId, { now: NOW, },);
    expect(cooling.size,).toBe(0,);
  });

  test("cooldownMs override narrows or widens the window", async () => {
    await skipFor(alice, NOW - 30_000,);
    const narrow = await fetchSkipCooldowns(db, chatId, { now: NOW, cooldownMs: 10_000, },);
    expect(narrow.has(alice,),).toBe(false,);
    const wide = await fetchSkipCooldowns(db, chatId, { now: NOW, cooldownMs: 60_000, },);
    expect(wide.has(alice,),).toBe(true,);
  });
});
