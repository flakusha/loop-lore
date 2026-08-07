import type { Kysely, } from "kysely";
import type { LocationTraitRow, WorldTraitRow, } from "./types";

/** Get all world and location traits for a single actor */
export async function getAllTraitsForActor(
  db: Kysely<any>,
  actorId: string,
): Promise<{
  worldTraits: WorldTraitRow[];
  locationTraits: LocationTraitRow[];
}> {
  const worldTraits = (await db
    .selectFrom("character_world_traits",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .execute()) as WorldTraitRow[];

  const locationTraits = (await db
    .selectFrom("character_location_traits",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .execute()) as LocationTraitRow[];

  return { worldTraits, locationTraits, };
}
