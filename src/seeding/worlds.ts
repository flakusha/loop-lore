// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/seeding/worlds.ts — config-driven world seeding
//
// Creates configured worlds (TASK-content-seeding-environment-overrides) on
// startup, owned by a prepopulated user, with optional child locations.
//
// Idempotent per (owner, name): a world with the same name already owned by
// that user is skipped (locations are seeded only on first creation). Unknown
// creators are skipped with a warning.

import type { Kysely, } from "kysely";
import type { SeedWorld, } from "../config/schema";
import type { DB, } from "../db/schema";
import type { Logger, } from "../logger";
import { uid, } from "../utils";
import { recordSeedAudit, } from "./audit";

/**
 * Seed worlds (and their child locations) from config.
 *
 * @param database - Kysely instance
 * @param worlds - World definitions (creator referenced by username)
 * @param userById - Username → user id map
 * @param log - Logger child
 * @returns number of worlds created
 */
export async function seedWorlds(
  database: Kysely<DB>,
  worlds: readonly SeedWorld[],
  userById: ReadonlyMap<string, string>,
  log: Logger,
): Promise<number> {
  let created = 0;
  for (const world of worlds) {
    const ownerId = userById.get(world.creator,);
    if (!ownerId) {
      log.warn(`Skipping world "${world.name}": creator "${world.creator}" not found`,);
      continue;
    }

    const existing = await database
      .selectFrom("worlds",)
      .select("id",)
      .where("owner_id", "=", ownerId,)
      .where("name", "=", world.name,)
      .executeTakeFirst();
    if (existing) {
      log.debug(`World "${world.name}" already exists — skipping`,);
      continue;
    }

    const worldId = uid();
    await database
      .insertInto("worlds",)
      .values({
        id: worldId,
        owner_id: ownerId,
        name: world.name,
        description: world.description ?? null,
        visibility: world.visibility ?? "private",
        publication_status: world.visibility === "public" ? "published" : "draft",
        kind: "rpg",
      },)
      .execute();
    await recordSeedAudit(database, "world", worldId, {
      name: world.name,
      creator: world.creator,
      locations: world.locations?.length ?? 0,
    },);
    created += 1;

    const locations = world.locations ?? [];
    for (const location of locations) {
      await database
        .insertInto("locations",)
        .values({
          id: uid(),
          world_id: worldId,
          name: location.name,
          description: location.description ?? null,
        },)
        .execute();
    }

    log.info(`Seeded world "${world.name}" (creator ${world.creator})`,);
  }
  return created;
}
