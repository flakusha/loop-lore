// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/seeding/characters.ts — config-driven character seeding
//
// Creates configured characters (TASK-content-seeding-environment-overrides)
// on startup as `actors` rows (actor_type = "character") owned by a prepopulated
// user, mirroring the unified actor model used by chat participants.
//
// Idempotent per (owner, stable id): the character's row id is derived from its
// stable template identity, so an in-app display_name rename never produces a
// duplicate. Unknown owners are skipped with a warning — reference users are
// expected to be seeded via seeding.users (or exist already).
import type { Kysely, } from "kysely";
import { adoptExistingActor, findExistingActor, stableSeedCharacterId, } from "../characters/seed/identity";
import type { SeedCharacter, } from "../config/schema";
import { ActorType, AgentType, } from "../db/enums";
import type { DB, } from "../db/schema";
import type { Logger, } from "../logger";
import { jsonStringifyOr, } from "../utils";
import { recordSeedAudit, } from "./audit";
/**
 * Seed characters from config into the database as `actors` rows.
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

    // Stable identity: the row's own id, derived from the owner-qualified config
    // key — never display_name, which the character edit route lets users change
    // freely (BUG-character-seed-dedupes-on-display-name).
    const characterId = stableSeedCharacterId(character.owner, character.name,);
    const existing = await findExistingActor(
      database,
      characterId,
      { ownerId, seededAs: character.name, },
    );

    if (existing) {
      if (existing.needsAdoption) {
        // Pre-upgrade row holding a crypto-random id (this path used to
        // allocate `uid()` unconditionally): converge it onto the stable
        // identity rather than leaving it resolvable only by display name.
        // A failure here logs but still `continue`s, so the row can never
        // be duplicated.
        try {
          await adoptExistingActor(database, existing.id, characterId,);
        } catch (error) {
          log.warn(
            `Could not adopt character "${character.name}" onto stable id ${characterId}: ${(error as Error).message}`,
          );
        }
      }

      log.debug(`Character "${character.name}" already exists — skipping`,);
      continue;
    }

    await database
      .insertInto("actors",)
      .values({
        id: characterId,
        actor_type: ActorType.Character,
        agent_type: AgentType.None,
        display_name: character.name,
        description: character.description ?? null,
        personality: character.personality
          ? jsonStringifyOr(character.personality, "null",)
          : null,
        visibility: character.visibility ?? "private",
        user_id: null,
        owner_id: ownerId,
        settings: "{}",
        import_spec: "raw",
        data_source_format: "json",
        data_raw: null,
        row_version: 0,
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
