// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { getEncounter, } from "./crud";
import type { AdvancePhaseResult, EncounterOutcome, NsfwEncounter, } from "./types";

/**
 * Roll for outcomes based on probability.
 * @param outcomes
 */
function rollOutcomes(outcomes: EncounterOutcome[],): EncounterOutcome[] {
  const triggered: EncounterOutcome[] = [];
  for (const outcome of outcomes) {
    if (Math.random() < outcome.probability) {
      triggered.push(outcome,);
    }
  }
  return triggered;
}

/**
 * Apply outcome effects (placeholder — would modify mood/intimacy).
 * @param encounter
 * @param outcomes
 */
function applyOutcomes(
  encounter: NsfwEncounter,
  outcomes: EncounterOutcome[],
): void {
  // Outcome effects would be applied to participants here
  // For now, just log them
  const log = getLogger().child({ module: "encounters", },);
  for (const outcome of outcomes) {
    log.info(
      `Encounter ${encounter.id} outcome: ${outcome.type} (intimacy ${
        outcome.effects.intimacyChange > 0 ? "+" : ""
      }${outcome.effects.intimacyChange})`,
    );
  }
}

/**
 * Advance an encounter to the next phase.
 *
 * Returns triggered outcomes if the encounter completes.
 * @param db
 * @param encounterId
 */
export async function advancePhase(
  db: Kysely<DB>,
  encounterId: string,
): Promise<AdvancePhaseResult> {
  const encounter = await getEncounter(db, encounterId,);
  if (!encounter) {
    return { complete: true, phaseIndex: 0, phase: null, triggeredOutcomes: [], };
  }

  const nextPhase = encounter.currentPhase + 1;
  const isComplete = nextPhase >= encounter.phases.length;

  if (isComplete) {
    // Roll for outcomes
    const triggered = rollOutcomes(encounter.outcomes,);

    // Apply outcomes
    await applyOutcomes(encounter, triggered,);

    // Mark complete
    const now = new Date().toISOString();
    await db
      .updateTable("nsfw_encounters",)
      .set({
        status: "completed",
        current_phase: nextPhase,
        updated_at: now,
      },)
      .where("id", "=", encounterId,)
      .execute();

    const log = getLogger().child({ module: "encounters", },);
    log.info(`Encounter ${encounterId} completed with ${triggered.length} outcomes`,);

    return {
      complete: true,
      phaseIndex: nextPhase,
      phase: null,
      triggeredOutcomes: triggered,
    };
  }

  // Move to next phase
  const now = new Date().toISOString();
  await db
    .updateTable("nsfw_encounters",)
    .set({
      current_phase: nextPhase,
      updated_at: now,
    },)
    .where("id", "=", encounterId,)
    .execute();

  return {
    complete: false,
    phaseIndex: nextPhase,
    phase: encounter.phases[nextPhase]!,
    triggeredOutcomes: [],
  };
}
