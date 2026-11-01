// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Encounter-triggered battle starts (B1 decision: all triggers wired).
 *
 * A `combat`-type encounter template rolling `triggered` converts into a
 * battle in the caller's chat: roster resolves from chat participants,
 * the world `rpg_combat` gate applies, and an empty roster is a clean
 * refusal (mirrors `/battle start`). Non-combat templates pass through
 * untouched — the GM narrates them.
 */
import type { Kysely, } from "kysely";
import { resolveBattleRoster, } from "../../../assistant/commands/battle-utils.js";
import type { DB, } from "../../../db/schema.js";
import type { EncounterTemplate, } from "../../../worlds/encounter-types.js";
import { startBattle, } from "../battles.js";
import { log, } from "../log.js";
import { checkCommandMechanic, RpgMechanic, } from "../world-gate.js";
import type { BattleWithRoster, } from "./types.js";

/** Input for an encounter-driven battle start. */
export interface EncounterBattleInput {
  db: Kysely<DB>;
  chatId: string;
  worldId: string;
  createdBy: string;
  template: EncounterTemplate;
  /** Ambush trigger: skips the prep beat, defenders start surprised. */
  ambush?: boolean;
}

/**
 * Start a battle from a fired combat encounter template.
 * @param input Chat, world, creator, and the fired template
 * @returns The started battle, or null with a reason when no battle starts
 */
export async function startBattleFromEncounter(
  input: EncounterBattleInput,
): Promise<{ battle: BattleWithRoster | null; reason?: string }> {
  const { db, chatId, worldId, createdBy, template, } = input;
  if (template.type !== "combat") {
    return { battle: null, reason: "template is not a combat encounter", };
  }

  const denial = await checkCommandMechanic(db, worldId, RpgMechanic.Combat,);
  if (denial) {
    // D2-A: the denial reply IS the guard — nothing is written.
    return { battle: null, reason: denial, };
  }

  const roster = await resolveBattleRoster(db, chatId, createdBy,);
  if (roster.length === 0) {
    return { battle: null, reason: "no combatants found — chat participants need character_stats", };
  }

  const battle = await startBattle({ database: db, }, {
    chatId,
    worldId,
    createdBy,
    combatants: roster.map((r,) => r.combatant),
    ambush: input.ambush ?? false,
  },);

  log().info("Battle started from encounter", {
    battleId: battle.id,
    templateId: template.id,
    ambush: input.ambush ?? false,
  },);

  return { battle, };
}
