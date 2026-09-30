// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World State Service — Query & Snapshot Dispatchers
 *
 * State snapshots and read-only lookups for NPC/location state.
 */
import { uid, } from "../../utils";
import type { WorldState, } from "./types";

/**
 * Take a state snapshot for rollback/history
 * @param state
 * @param worldId
 * @param turnId
 * @param messageId
 * @param description
 * @returns {Promise<string>}
 */
export async function snapshot(
  state: WorldState,
  worldId: string,
  turnId?: string,
  messageId?: string,
  description?: string,
): Promise<string> {
  const id = uid();
  await state.db
    .insertInto("world_states",)
    .values({
      id,
      world_id: worldId,
      snapshot: "{}",
      trigger_message_id: messageId ?? null,
      trigger_turn_id: turnId ?? null,
      description: description ?? "Auto-snapshot",
    },)
    .execute();
  return id;
}

/**
 * Get NPC state for a given actor in a world
 * @param state
 * @param actorId
 * @param worldId
 * @returns {Promise<{ id: string; actor_id: string; created_at: string; updated_at: string; world_id: string; relationships: string; health: number; location_id: string | null; mental_state: string; knowledge: string; inventory: string; schedule: string; } | undefined>}
 */
export async function getNpcState(state: WorldState, actorId: string, worldId: string,) {
  return state.db
    .selectFrom("npc_states",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();
}

/**
 * Get location state for a given location
 * @param state
 * @param locationId
 * @returns {Promise<{ id: string; created_at: string; updated_at: string; world_id: string; weather: string | null; location_id: string; description_override: string | null; atmosphere: string | null; npcs_present: string; items_available: string; time_of_day: string | null; hazards: string; } | undefined>}
 */
export async function getLocationState(state: WorldState, locationId: string,) {
  return state.db
    .selectFrom("location_states",)
    .selectAll()
    .where("location_id", "=", locationId,)
    .executeTakeFirst();
}

/**
 * Get all NPCs at a given location
 * @param state
 * @param locationId
 * @returns {Promise<{ display_name: string; agent_type: AgentType; actor_id: string; health: number; mental_state: string; }[]>}
 */
export async function getNpcsAtLocation(state: WorldState, locationId: string,) {
  return state.db
    .selectFrom("npc_states",)
    .innerJoin("actors", "actors.id", "npc_states.actor_id",)
    .select([
      "npc_states.actor_id",
      "npc_states.health",
      "npc_states.mental_state",
      "actors.display_name",
      "actors.agent_type",
    ],)
    .where("npc_states.location_id", "=", locationId,)
    .execute();
}
