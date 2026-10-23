// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Level-up answer wiring for the questions service.
 *
 * Lives outside `service.ts` so that file stays under the 250-code-line
 * size gate. Called only for `level_up` questions; the dynamic import of
 * `../level/decisions.js` avoids a static questions <-> level cycle
 * (`decisions.ts` stages questions through this service).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getRpgLog, } from "../shared/rpg-service-utils";
import { type AbilityName, ALL_ABILITIES, } from "../stats/types.js";

/**
 * Spend the ASI budget selected by a `level_up` answer option.
 * @param db - Database handle.
 * @param questionId - Answered question (logging context only).
 * @param answeredBy - Actor id whose ASI budget is spent.
 * @param optionId - Selected option (`asi:<ability>+2` or `asi:auto`).
 * @param effectsApplied - Labels accumulator (mutated in place).
 * @param messageParts - Transcript accumulator (mutated in place).
 */
export async function applyLevelUpAnswer(
  db: Kysely<DB>,
  questionId: string,
  answeredBy: string,
  optionId: string,
  effectsApplied: string[],
  messageParts: string[],
): Promise<void> {
  const { resolveLevelUpDecision, } = await import("../level/decisions.js");
  const ability = optionId.startsWith("asi:",) && optionId.endsWith("+2",)
    ? optionId.slice("asi:".length, -"+2".length,)
    : null;

  if (optionId === "asi:auto") {
    const resolution = await resolveLevelUpDecision(db, answeredBy,);
    for (const spend of resolution.spends) {
      effectsApplied.push(`asi:${spend.ability}+${String(spend.granted,)}`,);
      messageParts.push(
        `+${String(spend.granted,)} ${spend.ability.toUpperCase()} allocated (${
          String(resolution.remaining,)
        } pending)`,
      );
    }
  } else if (ability !== null && (ALL_ABILITIES as readonly string[]).includes(ability,)) {
    const resolution = await resolveLevelUpDecision(db, answeredBy, {
      kind: "asi",
      ability: ability as AbilityName,
      points: 2,
    },);

    const spend = resolution.spends[0];

    if (spend) {
      effectsApplied.push(`asi:${spend.ability}+${String(spend.granted,)}`,);
      messageParts.push(
        `+${String(spend.granted,)} ${spend.ability.toUpperCase()} allocated (${String(spend.remaining,)} pending)`,
      );
    }
  } else {
    getRpgLog("questions",).warn("Level-up answer ignored: unknown ASI option", { questionId, optionId, },);
  }
}
