// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { getArousal, modifyArousal, } from "./arousal";
import { getDesireProfile, } from "./desire";
import { awardXp, getActorSkills, } from "./skills";
import type { SeductionAttemptOpts, SeductionResult, } from "./types";

/**
 * Attempt a seduction action.
 *
 * Skill check: roll 1d100 vs DC.
 * DC is influenced by target's arousal, turn-ons, and hard limits.
 * @param db
 * @param opts
 */
export async function attemptSeduction(db: Kysely<DB>, opts: SeductionAttemptOpts,): Promise<SeductionResult> {
  const { actorId, targetId, skillCategory, approach, worldId, } = opts;
  const log = getLogger().child({ module: "seduction", },);

  // Check hard limits first
  const targetProfile = await getDesireProfile(db, targetId,);
  const approachLower = approach.toLowerCase();
  const hardLimitTriggered = targetProfile.hardLimits.some(
    (limit,) => approachLower.includes(limit.toLowerCase(),),
  );

  if (hardLimitTriggered) {
    log.info(`Seduction blocked: hard limit triggered for ${targetId}`,);
    return {
      success: false,
      roll: 0,
      dc: 100,
      arousalDelta: -10,
      intimacyDelta: -5,
      xpGained: 0,
      description: "Hard limit triggered — seduction rejected.",
      hardLimitTriggered: true,
    };
  }

  // Get actor's skill (category-based, use first matching)
  const skills = await getActorSkills(db, actorId,);
  const relevantSkill = skills.find((s,) => s.category === skillCategory);
  const skillLevel = relevantSkill?.level ?? 1;

  // Calculate DC based on target's state
  const targetArousal = await getArousal(db, targetId, worldId,);
  const targetDesire = await getDesireProfile(db, targetId,);

  // Base DC 50, modified by target's arousal and desire
  let dc = 50;
  dc -= Math.floor(targetArousal.level * 0.3,); // Arousal makes them easier
  dc -= Math.floor(targetDesire.currentDesire * 0.2,); // Desire makes them easier

  // Turn-ons reduce DC
  const turnOnMatch = targetDesire.turnOns.some(
    (on,) => approachLower.includes(on.toLowerCase(),),
  );
  if (turnOnMatch) { dc -= 15; }

  // Turn-offs increase DC
  const turnOffMatch = targetDesire.turnOffs.some(
    (off,) => approachLower.includes(off.toLowerCase(),),
  );
  if (turnOffMatch) { dc += 15; }

  dc = Math.max(10, Math.min(90, dc,),);

  // Roll: skill level contributes to roll
  const roll = Math.floor(Math.random() * 50,) + Math.floor(skillLevel / 2,);
  const success = roll >= dc;

  // Calculate deltas
  const arousalDelta = success ? Math.floor(10 + skillLevel * 0.3,) : -5;
  const intimacyDelta = success ? Math.floor(3 + skillLevel * 0.1,) : -2;
  const xpGained = success ? 15 + Math.floor(dc / 5,) : 5;

  // Apply arousal change to target
  if (arousalDelta !== 0) {
    await modifyArousal(db, targetId, arousalDelta, worldId, `seduction:${skillCategory}`,);
  }

  // Award XP
  if (relevantSkill) {
    await awardXp(db, actorId, skillCategory, relevantSkill.name, xpGained,);
  }

  // Build description
  const description = success
    ? `Seduction successful! ${approach} resonated with the target.`
    : `Seduction failed. ${approach} didn't land as intended.`;

  log.info(
    `Seduction ${actorId}→${targetId}: ${success ? "success" : "failure"} (roll=${roll}, dc=${dc})`,
  );

  return {
    success,
    roll,
    dc,
    arousalDelta,
    intimacyDelta,
    xpGained,
    description,
    hardLimitTriggered: false,
  };
}
