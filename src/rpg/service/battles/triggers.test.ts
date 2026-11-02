// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * startBattleFromEncounter — combat-template → battle conversion.
 * Real test DB: covers the three refusals (non-combat template, world-gate
 * denial, empty roster) and the happy path over chat participants.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema.js";
import { createLogger, } from "../../../logger/index.js";
import { createTestDb, } from "../../../test-utils/create-test-db.js";
import {
  insertActors,
  insertCharacterStats,
  insertChatParticipants,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers.js";
import type { EncounterTemplate, } from "../../../worlds/encounter-types.js";
import { startBattleFromEncounter, } from "./triggers.js";

/** Only `id` + `type` are read by the trigger. */
const template = (
  type: string,
): EncounterTemplate => ({ id: `tpl-${type}-${Date.now()}`, type, } as unknown as EncounterTemplate);

/** Seed user + actor, returning the actor id. */
async function seedActor(db: Kysely<DB>, name: string,): Promise<{ userId: string; actorId: string }> {
  const userId = `user-${name}-${Date.now()}`;
  await insertUsers(
    db,
    userId,
    name,
    { id: userId, role: "solo", status: "active", settings: "{}", } as never,
  );

  const actorId = `actor-${name}-${Date.now()}`;
  await insertActors(db, name, { id: actorId, user_id: userId, } as never,);

  return { userId, actorId, };
}

describe("startBattleFromEncounter", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  it("passes non-combat templates through untouched", async () => {
    const result = await startBattleFromEncounter({
      db,
      chatId: "chat-any",
      worldId: "world-any",
      createdBy: "actor-any",
      template: template("travel",),
    },);

    expect(result.battle,).toBeNull();
    expect(result.reason,).toBe("template is not a combat encounter",);
  });

  it("refuses when the world gate denies combat", async () => {
    const { userId, } = await seedActor(db, "gate-owner",);
    const worldId = await insertWorlds(db, userId, "No Combat World",);

    const result = await startBattleFromEncounter({
      db,
      chatId: "chat-any",
      worldId,
      createdBy: "actor-any",
      template: template("combat",),
    },);

    expect(result.battle,).toBeNull();
    expect(result.reason,).toContain("RPG not enabled",);
  });

  it("refuses an empty roster with a clean reason", async () => {
    const { userId, actorId, } = await seedActor(db, "solo-owner",);
    const worldId = await insertWorlds(db, userId, "Combat World", {
      rpg_enabled: 1,
      rpg_combat: 1,
    },);

    const chatId = await insertChats(db, "Solo Chat", userId, { world_id: worldId, },);
    await insertChatParticipants(db, chatId, actorId,);

    const result = await startBattleFromEncounter({
      db,
      chatId,
      worldId,
      createdBy: actorId,
      template: template("combat",),
    },);

    expect(result.battle,).toBeNull();
    expect(result.reason,).toContain("no combatants found",);
  });

  it("starts the battle from chat-participant roster", async () => {
    const { userId, actorId, } = await seedActor(db, "party-owner",);
    const { actorId: foeId, } = await seedActor(db, "party-foe",);
    const worldId = await insertWorlds(db, userId, "Roster World", {
      rpg_enabled: 1,
      rpg_combat: 1,
    },);

    const chatId = await insertChats(db, "Party Chat", userId, { world_id: worldId, },);
    await insertChatParticipants(db, chatId, actorId,);
    await insertChatParticipants(db, chatId, foeId,);
    await insertCharacterStats(db, foeId, 28, 28, 15,);

    const result = await startBattleFromEncounter({
      db,
      chatId,
      worldId,
      createdBy: actorId,
      template: template("combat",),
    },);

    expect(result.battle,).not.toBeNull();
    expect(result.reason,).toBeUndefined();
    expect(result.battle?.chatId,).toBe(chatId,);
    expect(result.battle?.worldId,).toBe(worldId,);
    expect(result.battle?.combatants,).toHaveLength(1,);
    expect(result.battle?.combatants[0]?.id,).toBe(foeId,);
  });
});
