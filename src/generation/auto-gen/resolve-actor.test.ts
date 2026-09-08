// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for resolveActor cascade-branch participant verification.
 *
 * A pre-selected cascadeActorId must still be a chat participant: the id
 * arrives from the prior cascade depth and may be stale (actor left) or
 * forged. Without the membership check, generation runs as a
 * non-participant.
 *
 * Uses in-memory SQLite via createTestDb().
 */
import { afterAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { resolveActor, } from "./resolve-actor";

describe("resolveActor cascade participant check", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    const created = await createTestDb();
    db = created.db;
  },);

  afterAll(async () => {
    await db?.destroy();
  },);

  test("participant cascade actor resolves", async () => {
    const chatId = uid();
    const actorId = uid();
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Alice",
        user_id: null,
        owner_id: null,
        agent_type: "ai",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
    await db
      .insertInto("users",)
      .values({
        id: "user-1",
        username: "user-1",
        display_name: "Test User",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();
    await db
      .insertInto("chats",)
      .values({
        id: chatId,
        name: "Test Chat",
        type: "group",
        mode: "group",
        created_by: "user-1",
      },)
      .execute();
    await db
      .insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: actorId, role_in_chat: "member", },)
      .execute();
    const resolved = await resolveActor(db, {
      type: "group",
      cascadeActorId: actorId,
      chatId,
      userId: "user-1",
    },);
    expect(resolved,).toEqual({ characterId: actorId, characterName: "Alice", },);
  });

  test("non-participant cascade actor returns null", async () => {
    const chatId = uid();
    const actorId = uid();
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Mallory",
        user_id: null,
        owner_id: null,
        agent_type: "ai",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
    // No chat_participants row — actor exists but is not in this chat.
    const resolved = await resolveActor(db, {
      type: "group",
      cascadeActorId: actorId,
      chatId,
      userId: "user-1",
    },);
    expect(resolved,).toBeNull();
  });

  test("unknown cascade actor id returns null", async () => {
    const resolved = await resolveActor(db, {
      type: "group",
      cascadeActorId: "no-such-actor",
      chatId: uid(),
      userId: "user-1",
    },);
    expect(resolved,).toBeNull();
  });
});
