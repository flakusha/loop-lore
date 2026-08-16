// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/services/personality-service/resolve.ts — Resolve character traits across layers

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import type { TraitCategory, } from "../../../db/enums";
import { checkPersonalityIntegrity, } from "./integrity";
import type { PersonalityLockResult, } from "./integrity";

/**
 * Resolve character traits across layers, applying personality integrity rules.
 *
 * Layer 0 (permanent) → Layer 2 (world) → Layer 3 (location)
 * Personality traits from Layer 0 are NEVER overridden by higher layers.
 *
 * @returns Resolved traits with integrity violations flagged
 */
export async function resolveCharacterTraits(
  database: Kysely<DB>,
  actorId: string,
  worldId?: string,
  locationId?: string,
): Promise<{
  resolved: Record<string, string>;
  violations: PersonalityLockResult[];
  layers: {
    permanent: Record<string, string>;
    world: Record<string, string>;
    location: Record<string, string>;
  };
}> {
  // Layer 0: Permanent traits
  const permanentRows = await database
    .selectFrom("character_permanent_traits",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .execute();

  const permanent: Record<string, string> = {};
  for (const row of permanentRows) {
    permanent[row.trait_name] = row.trait_value;
  }

  // Layer 2: World traits
  const world: Record<string, string> = {};
  if (worldId) {
    const worldRows = await database
      .selectFrom("character_world_traits",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .execute();

    for (const row of worldRows) {
      // Check personality integrity
      const lock = checkPersonalityIntegrity(row.trait_name, row.trait_category as TraitCategory,);
      if (!lock.allowed) {
        // Skip — personality integrity violation
        continue;
      }
      world[row.trait_name] = row.trait_value;
    }
  }

  // Layer 3: Location traits
  const location: Record<string, string> = {};
  if (locationId) {
    const locationRows = await database
      .selectFrom("character_location_traits",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .where("location_id", "=", locationId,)
      .execute();

    for (const row of locationRows) {
      location[row.trait_name] = row.trait_value;
    }
  }

  // Merge: permanent → world → location (higher layers override non-immutable)
  const resolved: Record<string, string> = { ...permanent, ...world, ...location, };

  // Collect violations (for audit/logging)
  const violations: PersonalityLockResult[] = [];
  for (const row of permanentRows) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- WorldTraitCategory ≠ TraitCategory
    const lock = checkPersonalityIntegrity(row.trait_name, row.trait_category as TraitCategory,);
    if (!lock.allowed) {
      violations.push(lock,);
    }
  }

  return { resolved, violations, layers: { permanent, world, location, }, };
}
