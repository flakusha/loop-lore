// src/characters/services/personality-service/modifiers.ts — Behavioral modifiers

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";

/**
 * Apply a behavioral modifier to a character within a specific world/story context.
 *
 * This does NOT change personality — it adds a contextual modifier that shifts
 * how personality is EXPRESSED (e.g., "in this world, she speaks more formally").
 *
 * Stored as a world trait with a "behavioral_modifier" prefix.
 */
export async function applyBehavioralModifier(
  database: Kysely<DB>,
  actorId: string,
  worldId: string,
  modifierName: string,
  modifierValue: string,
): Promise<string> {
  // Behavioral modifiers are stored as world traits in the "cultural" category
  // They can shift expression but NOT change core personality
  const id = crypto.randomUUID();
  await database
    .insertInto("character_world_traits",)
    .values({
      id,
      actor_id: actorId,
      world_id: worldId,
      trait_category: "cultural",
      trait_name: `behavioral_modifier:${modifierName}`,
      trait_value: modifierValue,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },)
    .execute();

  return id;
}

/**
 * Get all behavioral modifiers for a character in a world.
 * These are world traits with the "behavioral_modifier:" prefix.
 */
export async function getBehavioralModifiers(
  database: Kysely<DB>,
  actorId: string,
  worldId: string,
): Promise<Record<string, string>> {
  const rows = await database
    .selectFrom("character_world_traits",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .execute();

  const modifiers: Record<string, string> = {};
  for (const row of rows) {
    if (!row.trait_name.startsWith("behavioral_modifier:",)) {
      continue;
    }
    const name = row.trait_name.slice("behavioral_modifier:".length,);
    modifiers[name] = row.trait_value;
  }

  return modifiers;
}
