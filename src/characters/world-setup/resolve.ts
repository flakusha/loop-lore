// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character World Setup Service — resolution dispatcher
 *
 * Merges the base `actors` setup with the `character_world_setup` overlay for
 * a specific world. Non-null overrides win; base values are preserved for diff.
 */
import { jsonParseOr, } from "../../utils";
import { getWorldSetup, } from "./crud";
import type {
  CharacterWorldSetupContext,
  ResolvedCharacterWorldSetup,
  WorldSetupInventoryItem,
  WorldSetupLoreEntry,
} from "./types";

/** Args for {@link resolveCharacterWorldSetup}. */
export interface ResolveCharacterWorldSetupArgs {
  thisL: CharacterWorldSetupContext;
  actorId: string;
  worldId: string;
}

/**
 * Resolve a character's effective setup within a world.
 *
 * Returns undefined if the actor does not exist. When no world setup row is
 * present, the overlay fields fall back to the base actor setup and empty
 * collections, so the result is always complete for a valid actor.
 * @param root0
 * @param root0.thisL
 * @param root0.actorId
 * @param root0.worldId
 */
export async function resolveCharacterWorldSetup(
  { thisL, actorId, worldId, }: ResolveCharacterWorldSetupArgs,
): Promise<ResolvedCharacterWorldSetup | undefined> {
  const actor = await thisL.db
    .selectFrom("actors",)
    .selectAll()
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (!actor) { return undefined; }

  const setup = await getWorldSetup({ thisL, actorId, worldId, },);

  return {
    actorId,
    worldId,
    baseScenario: actor.scenario,
    baseSystemPrompt: actor.system_prompt,
    scenario: setup?.scenario_override ?? actor.scenario,
    systemPrompt: setup?.system_prompt_override ?? actor.system_prompt,
    backstory: setup?.backstory ?? null,
    startingInventory: jsonParseOr<WorldSetupInventoryItem[]>(setup?.starting_inventory ?? "[]", [],),
    loreEntries: jsonParseOr<WorldSetupLoreEntry[]>(setup?.lore_entries ?? "[]", [],),
    initialState: jsonParseOr<Record<string, unknown>>(setup?.initial_state ?? "{}", {},),
  };
}
