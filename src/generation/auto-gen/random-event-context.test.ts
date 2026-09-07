// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/auto-gen/random-event-context.ts — participant and
 * location lookups feeding random-event placeholder substitution.
 */
import type { Database, } from "bun:sqlite";
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { ActorType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { loadChatLocation, loadChatParticipants, } from "./random-event-context";

let db: Kysely<DB>;
let sqlite: Database;
beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

/** Seed user + world + location + chat with a current location. */
async function seedWorldAndChat(): Promise<void> {
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
    name: "Tavern",
    description: "A smoky tavern.",
  },).execute();
  await db.insertInto("chats",).values({
    id: "chat-1",
    name: "Chat",
    type: "direct",
    mode: "direct",
    created_by: "user-1",
    current_location_id: "loc-1",
  },).execute();
  await db.insertInto("chats",).values({
    id: "chat-no-loc",
    name: "No Location Chat",
    type: "direct",
    mode: "direct",
    created_by: "user-1",
  },).execute();
}

/** Seed one actor and attach it to a chat as participant. */
async function seedParticipant(
  actorId: string,
  actorType: ActorType,
  displayName: string,
  chatId: string,
): Promise<void> {
  await db.insertInto("actors",).values({
    id: actorId,
    actor_type: actorType,
    display_name: displayName,
    agent_type: "ai",
    settings: "{}",
    format_version: 0,
    import_spec: "{}",
  },).execute();
  await db.insertInto("chat_participants",).values({
    chat_id: chatId,
    actor_id: actorId,
  },).execute();
}

describe("loadChatParticipants", () => {
  it("returns an empty list for a chat without participants", async () => {
    await seedWorldAndChat();
    expect(await loadChatParticipants(db, "chat-no-loc",),).toEqual([],);
  });

  it("maps character actors to the ai role", async () => {
    await seedWorldAndChat();
    await seedParticipant("actor-char", "character", "Lyra", "chat-1",);

    const participants = await loadChatParticipants(db, "chat-1",);
    expect(participants,).toEqual([
      { id: "actor-char", displayName: "Lyra", role: "ai", },
    ],);
  });

  it("maps non-character actors to the user role", async () => {
    await seedWorldAndChat();
    await seedParticipant("actor-char", "character", "Lyra", "chat-1",);
    await seedParticipant("actor-human", "user", "Player", "chat-1",);

    const participants = await loadChatParticipants(db, "chat-1",);
    expect(participants,).toEqual([
      { id: "actor-char", displayName: "Lyra", role: "ai", },
      { id: "actor-human", displayName: "Player", role: "user", },
    ],);
  });
});

describe("loadChatLocation", () => {
  it("returns null when the chat has no current location", async () => {
    await seedWorldAndChat();
    expect(await loadChatLocation(db, null,),).toBeNull();
  });

  it("returns null when the location row is missing", async () => {
    await seedWorldAndChat();
    expect(await loadChatLocation(db, "loc-vanished",),).toBeNull();
  });

  it("loads the location with its description", async () => {
    await seedWorldAndChat();
    const location = await loadChatLocation(db, "loc-1",);
    expect(location,).toEqual({
      id: "loc-1",
      name: "Tavern",
      description: "A smoky tavern.",
    },);
  });

  it("maps a NULL description to undefined", async () => {
    await seedWorldAndChat();
    await db.insertInto("locations",).values({
      id: "loc-2",
      world_id: "world-1",
      name: "Crossroads",
      description: null,
    },).execute();

    const location = await loadChatLocation(db, "loc-2",);
    expect(location,).toEqual({ id: "loc-2", name: "Crossroads", description: undefined, },);
  });
});
