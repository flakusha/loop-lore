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
import type { ActorType, ChatType, } from "../../db/enums";
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

// ── Turn-selection + single-chat branches ───────────────────

/**
 * Seed user-1, an AI actor, and a chat with that actor as participant.
 * @param db
 * @param opts
 */
async function seedChatWithActor(
  db: Kysely<DB>,
  opts: { chatType?: ChatType; actorType?: ActorType; withParticipant?: boolean } = {},
): Promise<{ chatId: string; actorId: string }> {
  const chatId = uid();
  const actorId = uid();
  await db
    .insertInto("actors",)
    .values({
      id: actorId,
      actor_type: opts.actorType ?? "character",
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
      type: opts.chatType ?? "group",
      mode: opts.chatType ?? "group",
      created_by: "user-1",
    },)
    .execute();

  if (opts.withParticipant !== false) {
    await db
      .insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: actorId, role_in_chat: "member", },)
      .execute();
  }

  return { chatId, actorId, };
}

describe("resolveActor turn selection and single-chat", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    const created = await createTestDb();
    db = created.db;
  },);

  afterAll(async () => {
    await db?.destroy();
  },);

  test("single-chat resolves the non-user participant", async () => {
    const { chatId, actorId, } = await seedChatWithActor(db, { chatType: "direct", },);
    const resolved = await resolveActor(db, { type: "solo", chatId, userId: "user-1", },);
    expect(resolved,).toEqual({ characterId: actorId, characterName: "Alice", },);
  });

  test("single-chat without participants returns null", async () => {
    const { chatId, } = await seedChatWithActor(db, { chatType: "direct", withParticipant: false, },);
    const resolved = await resolveActor(db, { type: "solo", chatId, userId: "user-1", },);
    expect(resolved,).toBeNull();
  });

  test("group turn selection honors an @mention override", async () => {
    const { chatId, actorId, } = await seedChatWithActor(db,);
    const resolved = await resolveActor(db, {
      type: "group",
      chatId,
      userId: "user-1",
      userMessage: "hey @Alice go",
    },);

    expect(resolved,).toEqual({ characterId: actorId, characterName: "Alice", },);
  });

  test("group turn selection returns null when no AI participants exist", async () => {
    const { chatId, } = await seedChatWithActor(db, { actorType: "user", },);
    const resolved = await resolveActor(db, { type: "group", chatId, userId: "user-1", },);
    expect(resolved,).toBeNull();
  });
});

describe("resolveActor outbound mute enforcement (moderation AC3)", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    const created = await createTestDb();
    db = created.db;
  },);

  afterAll(async () => {
    await db?.destroy();
  },);

  /** Mute an existing participant row. */
  async function muteParticipant(db: Kysely<DB>, chatId: string, actorId: string,): Promise<void> {
    await db
      .updateTable("chat_participants",)
      .set({ muted_until: new Date(Date.now() + 3_600_000,).toISOString(), },)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", actorId,)
      .execute();
  }

  test("muted group cascade actor returns null", async () => {
    const { chatId, actorId, } = await seedChatWithActor(db, { chatType: "group", },);
    await muteParticipant(db, chatId, actorId,);
    const resolved = await resolveActor(db, {
      type: "group",
      cascadeActorId: actorId,
      chatId,
      userId: "user-1",
    },);

    expect(resolved,).toBeNull();
  });

  test("muted single-chat partner returns null", async () => {
    const { chatId, actorId, } = await seedChatWithActor(db, { chatType: "direct", },);
    await muteParticipant(db, chatId, actorId,);
    const resolved = await resolveActor(db, { type: "solo", chatId, userId: "user-1", },);
    expect(resolved,).toBeNull();
  });
});
