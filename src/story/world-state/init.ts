// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World State Service — Initialization Dispatchers
 *
 * Seed dynamic state rows for NPCs and locations in a world.
 */
import type { WorldSetupInventoryItem, } from "../../characters/world-setup/types";
import { ItemVisibility, } from "../../db/enums";
import { jsonParseOr, uid, } from "../../utils";
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

/** Initialize per-world character setup rows for all characters in a world */
export async function initializeCharacterWorldSetup(state: WorldState, worldId: string,): Promise<number> {
  const characters = await state.db
    .selectFrom("actors",)
    .selectAll()
    .where("actor_type", "in", ["character", "narrator",] as ("character" | "narrator")[],)
    .where("agent_type", "in", ["ai", "npc",] as ("ai" | "npc")[],)
    .execute();

  let count = 0;
  for (const character of characters) {
    const existing = await state.db
      .selectFrom("character_world_setup",)
      .select("id",)
      .where("actor_id", "=", character.id,)
      .where("world_id", "=", worldId,)
      .executeTakeFirst();

    if (!existing) {
      await state.db
        .insertInto("character_world_setup",)
        .values({
          id: uid(),
          actor_id: character.id,
          world_id: worldId,
          starting_inventory: "[]",
          lore_entries: "[]",
          backstory: null,
          scenario_override: null,
          system_prompt_override: null,
          initial_state: "{}",
        },)
        .execute();
      count++;
    }
  }
  return count;
}

/**
 * Seed world_items from each character's `starting_inventory` on first join.
 *
 * Idempotent — only grants when the actor carries no items in this world yet
 * (a character entering a world starts empty, then gets their starting gear).
 * Items whose definition does not exist in `items` are skipped (the world
 * author must create definitions before the seed resolves them).
 */
export async function seedStartingInventory(state: WorldState, worldId: string,): Promise<number> {
  const setups = await state.db
    .selectFrom("character_world_setup",)
    .select(["actor_id", "starting_inventory",],)
    .where("world_id", "=", worldId,)
    .execute();

  const itemDefs = await state.db
    .selectFrom("items",)
    .select("id",)
    .where("world_id", "=", worldId,)
    .execute();
  const known = new Set<string>();
  for (const item of itemDefs) { known.add(item.id,); }

  let granted = 0;
  for (const setup of setups) {
    const starting = jsonParseOr<WorldSetupInventoryItem[]>(setup.starting_inventory, [],);
    if (starting.length === 0) { continue; }

    const existing = await state.db
      .selectFrom("world_items",)
      .select("id",)
      .where("owner_actor_id", "=", setup.actor_id,)
      .where("world_id", "=", worldId,)
      .executeTakeFirst();
    if (existing) { continue; }

    for (const item of starting) {
      if (!known.has(item.item_id,)) { continue; }
      await state.db
        .insertInto("world_items",)
        .values({
          id: uid(),
          world_id: worldId,
          item_id: item.item_id,
          owner_actor_id: setup.actor_id,
          location_id: null,
          quantity: item.quantity > 0 ? item.quantity : 1,
          visibility: ItemVisibility.Visible,
          respawnable: 0,
          spawn_condition: null,
        },)
        .execute();
      granted++;
    }
  }
  return granted;
}

/** Initialize location dynamic states for all locations in a world */ export async function initializeLocationStates(
  state: WorldState,
  worldId: string,
): Promise<number> {
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
