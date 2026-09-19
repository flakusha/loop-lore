// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { MoodService, } from "../../../characters/services/mood-service";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { IntimacyService, } from "../../intimacy/service";
import { LocationNsfwService, } from "../../location-nsfw/service";
import { getEncounter, } from "./crud";
import { applyParticipantLegs, } from "./participant-legs";
import { applyReputationLeg, } from "./reputation-leg";
import type { AdvancePhaseResult, EncounterOutcome, NsfwEncounter, } from "./types";
import { resolveAtmosphereBonus, } from "./venue";

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
 * Apply outcome effects.
 *
 * Fan-out (TASK-036/037/038/040/041/042): each triggered outcome's deltas
 * land in the canonical stores — intimacy pairs, mood events, the
 * shared XP ledger, reputation deltas, fantasy exploration counts,
 * pregnancy rolls, memory rows. Every leg is best-effort (try/catch) so a missing
 * auxiliary row never fails the encounter completion itself. Outcomes
 * with `memoryCreated` persist one `actor_memories` row per participant
 * so the long-term memory pipeline (Open Q8) sees the encounter.
 * @param db
 * @param encounter
 * @param outcomes
 */
async function applyOutcomes(
  db: Kysely<DB>,
  encounter: NsfwEncounter,
  outcomes: EncounterOutcome[],
): Promise<void> {
  const log = getLogger().child({ module: "encounters", },);
  if (outcomes.length === 0) { return; }
  const intimacy = new IntimacyService(db,);
  const mood = MoodService(db,);
  const locations = new LocationNsfwService(db,);
  for (const outcome of outcomes) {
    log.info(
      `Encounter ${encounter.id} outcome: ${outcome.type} (intimacy ${
        outcome.effects.intimacyChange > 0 ? "+" : ""
      }${outcome.effects.intimacyChange})`,
    );
    const intimacyDelta = outcome.effects.intimacyChange +
      await resolveAtmosphereBonus(db, locations, log, encounter.id,);
    for (const participant of encounter.participants) {
      await applyParticipantLegs(db, { intimacy, mood, log, encounter, outcome, intimacyDelta, participant, },);
    }
    await applyReputationLeg(db, log, encounter, outcome,);
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
    await applyOutcomes(db, encounter, triggered,);

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
