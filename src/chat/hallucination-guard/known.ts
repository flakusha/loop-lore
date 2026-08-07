import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import type { KnownEntities, } from "./types";

/** Load all known entities from the database for validation. */
export async function loadKnownEntities(
  db: Kysely<DB>,
  worldId?: string,
): Promise<KnownEntities> {
  const actors = new Set<string>();
  const locations = new Set<string>();
  const items = new Set<string>();
  const worlds = new Set<string>();

  // Load actor names
  const actorRows = await db
    .selectFrom("actors",)
    .select("display_name",)
    .limit(500,)
    .execute();
  for (const row of actorRows) {
    actors.add(row.display_name.toLowerCase(),);

    // Also add first name only
    const firstName = row.display_name.split(/\s+/, 1,)[0];
    if (firstName) { actors.add(firstName.toLowerCase(),); }
  }

  // Load location names
  let locQuery = db.selectFrom("locations",).select("name",);
  if (worldId) {
    locQuery = locQuery.where("world_id", "=", worldId,);
  }
  const locRows = await locQuery.limit(500,).execute();
  for (const row of locRows) {
    locations.add(row.name.toLowerCase(),);
  }

  // Load item names
  let itemQuery = db.selectFrom("items",).select("name",);
  if (worldId) {
    itemQuery = itemQuery.where("world_id", "=", worldId,);
  }
  const itemRows = await itemQuery.limit(500,).execute();
  for (const row of itemRows) {
    items.add(row.name.toLowerCase(),);
  }

  // Load world names
  const worldRows = await db
    .selectFrom("worlds",)
    .select("name",)
    .limit(100,)
    .execute();
  for (const row of worldRows) {
    worlds.add(row.name.toLowerCase(),);
  }

  return { actors, locations, items, worlds, };
}

/** Check if an entity is in any known set. */
export function isKnownEntity(
  name: string,
  known: KnownEntities,
  _knownActorIds: string[],
  _knownLocationIds: string[],
): boolean {
  const lower = name.toLowerCase();
  return known.actors.has(lower,) ||
    known.locations.has(lower,) ||
    known.items.has(lower,) ||
    known.worlds.has(lower,);
}
