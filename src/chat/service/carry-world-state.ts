/**
 * Chat migration carry: world/npc/location state snapshots.
 *
 * Copies world-scoped snapshots (`world_states`, `npc_states`,
 * `location_states`) from the source world into the target world. Only
 * invoked when the migrated chat's world differs from the source's, since
 * same-world chats already share these rows.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

// ── Carry world/npc/location state snapshots ───────────────────

/**
 * Carry world/npc/location state snapshots for the party's world.
 * These are world-scoped (not chat-scoped); when migrating to a template in
 * the same world they are already shared, so this only copies them when the
 * new chat's world differs from the source's.
 */
export async function carryWorldState(
  database: Kysely<DB>,
  sourceWorldId: string,
  targetWorldId: string,
): Promise<void> {
  const states = await database
    .selectFrom("world_states",)
    .selectAll()
    .where("world_id", "=", sourceWorldId,)
    .execute();
  for (const s of states) {
    await database
      .insertInto("world_states",)
      .values({
        id: crypto.randomUUID(),
        world_id: targetWorldId,
        snapshot: s.snapshot,
        trigger_message_id: s.trigger_message_id,
        trigger_turn_id: s.trigger_turn_id,
        description: s.description,
        created_at: s.created_at,
      },)
      .execute();
  }

  const npcStates = await database
    .selectFrom("npc_states",)
    .selectAll()
    .where("world_id", "=", sourceWorldId,)
    .execute();
  for (const n of npcStates) {
    await database
      .insertInto("npc_states",)
      .values({
        id: crypto.randomUUID(),
        actor_id: n.actor_id,
        world_id: targetWorldId,
        location_id: n.location_id,
        health: n.health,
        mental_state: n.mental_state,
        knowledge: n.knowledge,
        relationships: n.relationships,
        inventory: n.inventory,
        schedule: n.schedule,
        created_at: n.created_at,
        updated_at: n.updated_at,
      },)
      .execute();
  }

  const locationStates = await database
    .selectFrom("location_states",)
    .selectAll()
    .where("world_id", "=", sourceWorldId,)
    .execute();
  for (const l of locationStates) {
    await database
      .insertInto("location_states",)
      .values({
        id: crypto.randomUUID(),
        location_id: l.location_id,
        world_id: targetWorldId,
        description_override: l.description_override,
        atmosphere: l.atmosphere,
        npcs_present: l.npcs_present,
        items_available: l.items_available,
        time_of_day: l.time_of_day,
        weather: l.weather,
        hazards: l.hazards,
        created_at: l.created_at,
        updated_at: l.updated_at,
      },)
      .execute();
  }
}
