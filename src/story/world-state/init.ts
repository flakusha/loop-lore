/**
 * World State Service — Initialization Dispatchers
 *
 * Seed dynamic state rows for NPCs and locations in a world.
 */
import { uid, } from "../../utils";
import type { WorldState, } from "./types";

/** Initialize NPC dynamic states for all characters in a world */
export async function initializeNpcStates(state: WorldState, worldId: string,): Promise<number> {
  const characters = await state.db
    .selectFrom("actors",)
    .selectAll()
    .where("actor_type", "in", ["character", "narrator",] as ("character" | "narrator")[],)
    .where("agent_type", "in", ["ai", "npc",] as ("ai" | "npc")[],)
    .execute();

  let count = 0;
  for (const character of characters) {
    const existing = await state.db
      .selectFrom("npc_states",)
      .select("id",)
      .where("actor_id", "=", character.id,)
      .where("world_id", "=", worldId,)
      .executeTakeFirst();

    if (!existing) {
      await state.db
        .insertInto("npc_states",)
        .values({
          id: uid(),
          actor_id: character.id,
          world_id: worldId,
          location_id: null,
          health: 100,
          mental_state: "neutral",
          inventory: "[]",
          relationships: "{}",
          knowledge: "{}",
          schedule: "{}",
        },)
        .execute();
      count++;
    }
  }
  return count;
}

/** Initialize location dynamic states for all locations in a world */
export async function initializeLocationStates(state: WorldState, worldId: string,): Promise<number> {
  const locations = await state.db
    .selectFrom("locations",)
    .select("id",)
    .where("world_id", "=", worldId,)
    .execute();

  let count = 0;
  for (const loc of locations) {
    const existing = await state.db
      .selectFrom("location_states",)
      .select("id",)
      .where("location_id", "=", loc.id,)
      .executeTakeFirst();

    if (!existing) {
      await state.db
        .insertInto("location_states",)
        .values({
          id: uid(),
          location_id: loc.id,
          world_id: worldId,
          time_of_day: "morning",
          npcs_present: "[]",
          items_available: "[]",
          hazards: "[]",
        },)
        .execute();
      count++;
    }
  }
  return count;
}
