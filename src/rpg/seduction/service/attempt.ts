// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { checkPrerequisites, getSeductionPrerequisites, } from "../../../nsfw/seduction-prerequisites";
import { rollDice, } from "../../dice";
import { FantasyService, } from "../../fantasies/service";
import { getModifier, } from "../../stats/modifiers";
import type { StatBlock, } from "../../stats/types";
import { getActiveEffects, } from "../../status-effects";
import { getArousal, } from "./arousal";
import { buildSkillLevels, classifyApproachCategory, SKILL_PRETTY, } from "./classify";
import { getDesireProfile, } from "./desire";
import { settleAttempt, } from "./settle";
import { getActorSkills, } from "./skills";
import type { SeductionAttemptOpts, SeductionResult, } from "./types";

/** Default ability scores when no character_stats row exists (mods of 0). */
const DEFAULT_STATS: StatBlock = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, };

/**
 * Load an actor's ability scores from `character_stats`, defaulting to
 * all-10 when the row is missing.
 * @param db
 * @param actorId
 */
async function getActorStatBlock(db: Kysely<DB>, actorId: string,): Promise<StatBlock> {
  const row = await db
    .selectFrom("character_stats",)
    .select(["str", "dex", "con", "int", "wis", "cha",],)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  if (!row) { return { ...DEFAULT_STATS, }; }
  return {
    str: row.str,
    dex: row.dex,
    con: row.con,
    int: row.int,
    wis: row.wis,
    cha: row.cha,
  };
}

/**
 * Attempt a seduction action.
 *
 * Skill check: roll 1d100 vs DC.
 * DC is influenced by target's arousal, turn-ons, and hard limits.
 * @param db
 * @param opts
 */
export async function attemptSeduction(db: Kysely<DB>, opts: SeductionAttemptOpts,): Promise<SeductionResult> {
  const { actorId, targetId, skillCategory, approach, worldId, reputationTier, } = opts;
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

  // N3 — skill prerequisites (tier-gated by target reputation). A refusal
  // returns a typed reason and short-circuits before any roll or state
  // mutation (no arousal/XP changes, no description of the attempt itself).
  const tier = reputationTier ?? "devoted";
  const skillLevels = await buildSkillLevels(db, actorId, skillCategory,);
  const prereqCheck = checkPrerequisites(getSeductionPrerequisites(tier,), skillLevels,);
  if (!prereqCheck.met) {
    const missingSkill = prereqCheck.missing[0]?.skill ?? "seduction";
    const missingName = SKILL_PRETTY[missingSkill] ?? missingSkill;
    const required = prereqCheck.missing[0]?.minLevel ?? 0;
    log.info(
      `Seduction blocked: prerequisite not met for ${targetId} (${missingSkill} ${required} required, have ${
        skillLevels[missingSkill]
      })`,
    );
    return {
      success: false,
      roll: 0,
      dc: 0,
      arousalDelta: 0,
      intimacyDelta: 0,
      xpGained: 0,
      description: `Prerequisite not met: ${missingName} level ${required} required.`,
      hardLimitTriggered: false,
      prerequisiteBlocked: true,
      missingPrerequisite: prereqCheck.missing,
    };
  }

  // Get actor's skill (category-based, use first matching)
  const skills = await getActorSkills(db, actorId,);
  const relevantSkill = skills.find((s,) => s.category === skillCategory);
  const skillLevel = relevantSkill?.level ?? 1;

  // ── Fantasy-flag desire matching (TASK-034) ─────────────────
  // Turn-on/turn-off alignment comes from the target's FantasyCategory-
  // keyed fantasy rows (read via FantasyService), not substring matching
  // of free-text desire lists.
  const fantasies = new FantasyService(db,);

  // ── Pheromone consult (TASK-039) ─────────────────────────────
  // Consumer-side read of the shared store: chemistry modifiers arrive
  // as active `physical` status rows, never by querying ChemistryService.
  const pheromones = await getActiveEffects(db, targetId, { category: "physical", },);
  const pheromoneDcBonus = pheromones
    .filter((e,) => e.effectId === "aphrodisiac" || e.effectId.startsWith("pheromone_",) || e.effectId === "arousal")
    .reduce((total, e,) => total - 5 * e.magnitude, 0,);

  // Calculate DC based on target's state
  const targetArousal = await getArousal(db, targetId, worldId,);
  const targetDesire = await getDesireProfile(db, targetId,);

  // Base DC 50, modified by target's arousal and desire
  let dc = 50;
  dc -= Math.floor(targetArousal.level * 0.3,); // Arousal makes them easier
  dc -= Math.floor(targetDesire.currentDesire * 0.2,); // Desire makes them easier
  dc += pheromoneDcBonus; // Pheromones ease (negative bonus)

  // Turn-ons reduce DC — matched against the target's fantasy rows by
  // FantasyCategory (approach is tagged by its invoked category).
  const approachCategory = classifyApproachCategory(approach,);
  const matchingFantasy = approachCategory
    ? await fantasies.getByCategory(targetId, approachCategory,)
    : [];
  const turnOnMatch = matchingFantasy.length > 0;
  if (turnOnMatch) { dc -= 15; }

  // Turn-offs increase DC
  const turnOffMatch = targetDesire.turnOffs.some(
    (off,) => approachLower.includes(off.toLowerCase(),),
  );
  if (turnOffMatch) { dc += 15; }

  dc = Math.max(10, Math.min(90, dc,),);

  // Roll (TASK-034): unified dice engine + CHA modifier, no bespoke RNG.
  // d100 open roll keeps the legacy 0–100 result scale; the actor's CHA
  // modifier replaces the old skillLevel/2 proxy.
  const actorStats = await getActorStatBlock(db, actorId,);
  const chaMod = getModifier(actorStats, "cha",);
  const diceRoll = rollDice(100, 1,);
  const roll = Math.max(0, diceRoll.rawTotal + chaMod,);
  const success = roll >= dc;

  // Calculate deltas
  const arousalDelta = success ? Math.floor(10 + skillLevel * 0.3,) : -5;
  const intimacyDelta = success ? Math.floor(3 + skillLevel * 0.1,) : -2;
  const xpGained = success ? 15 + Math.floor(dc / 5,) : 5;

  await settleAttempt({
    db,
    log,
    actorId,
    targetId,
    skillCategory,
    worldId,
    relevantSkill,
    success,
    arousalDelta,
    xpGained,
    intensityTier: opts.intensityTier,
  },);

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
