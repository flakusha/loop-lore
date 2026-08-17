// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/seeding/characters.ts — config-driven character seeding
//
// Creates configured characters (TASK-content-seeding-environment-overrides)
// on startup as `actors` rows (actor_type = "character") owned by a prepopulated
// user, mirroring the unified actor model used by chat participants.
//
// Idempotent per (owner, name): an actor with the same display name already
// owned by that user is skipped. Unknown owners are skipped with a warning —
// reference users are expected to be seeded via seeding.users (or exist already).

import type { Kysely, } from "kysely";
import type { SeedCharacter, } from "../config/schema";
import { ActorType, AgentType, } from "../db/enums";
import type { DB, } from "../db/schema";
import type { Logger, } from "../logger";
import { uid, } from "../utils";
import { recordSeedAudit, } from "./audit";

/**
 * Seed characters from config into the database as `actors` rows.
 *
 * @param database - Kysely instance
 * @param characters - Character definitions (owner referenced by username)
 * @param userById - Username → user id map (precomputed from prepopulated users)
 * @param log - Logger child
 * @returns number of characters created (0 when all existed / owners unknown)
 */
export async function seedCharacters(
  database: Kysely<DB>,
  characters: readonly SeedCharacter[],
  userById: ReadonlyMap<string, string>,
  log: Logger,
): Promise<number> {
  let created = 0;
  for (const character of characters) {
    const ownerId = userById.get(character.owner,);
    if (!ownerId) {
      log.warn(`Skipping character "${character.name}": owner "${character.owner}" not found`,);
      continue;
    }

    const existing = await database
      .selectFrom("actors",)
      .select("id",)
      .where("owner_id", "=", ownerId,)
      .where("actor_type", "=", ActorType.Character,)
      .where("display_name", "=", character.name,)
      .executeTakeFirst();
    if (existing) {
      log.debug(`Character "${character.name}" already exists — skipping`,);
      continue;
    }

    const characterId = uid();
    await database
      .insertInto("actors",)
      .values({
        id: characterId,
        actor_type: ActorType.Character,
        agent_type: AgentType.None,
        display_name: character.name,
        description: character.description ?? null,
        personality: character.personality
          ? JSON.stringify(character.personality,)
          : null,
        visibility: character.visibility ?? "private",
        user_id: null,
        owner_id: ownerId,
        settings: "{}",
        import_spec: "raw",
        data_source_format: "json",
        data_raw: null,
        format_version: 0,
      },)
      .execute();
    await recordSeedAudit(database, "character", characterId, {
      name: character.name,
      owner: character.owner,
    },);
    created += 1;
    log.info(`Seeded character "${character.name}" (owner ${character.owner})`,);
  }
  return created;
}
