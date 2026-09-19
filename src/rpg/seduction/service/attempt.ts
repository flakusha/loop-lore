// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { MoodService, } from "../../../characters/services/mood-service";
import { type FantasyCategory, type SeductionSkillCategory, } from "../../../db/enums";
import { ContentIntensity, } from "../../../db/enums-character/nsfw";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { AROUSAL_CEILING, } from "../../../schemas";
import {
  checkPrerequisites,
  getSeductionPrerequisites,
  type SocialSkillForNSFW,
} from "../../../nsfw/seduction-prerequisites";
import { getArousal, modifyArousal, } from "./arousal";
import { getDesireProfile, } from "./desire";
import { awardXp, getActorSkills, } from "./skills";
import type { SeductionAttemptOpts, SeductionResult, SeductionSkill, } from "./types";
import { rollDice, } from "../../dice";
import { logXp, } from "../../service/xp";
import { getModifier, } from "../../stats/modifiers";
import type { StatBlock, } from "../../stats/types";
import { FantasyService, } from "../../fantasies/service";

/**
 * Bijective map between NSFW social skills and the physical seduction skill
 * categories. When a social skill has no matching physical category (e.g.
 * `intimidation`), it falls back to the actor's CHA-derived proxy.
 */
const SOCIAL_SKILL_TO_CATEGORY: Record<SocialSkillForNSFW, SeductionSkillCategory | undefined> = {
  persuasion: "communication",
  deception: "roleplay",
  intimidation: "dominance",
  empathy: "aftercare",
  charisma: "communication",
  seduction: "communication",
};

/** Human-readable labels for prerequisite diagnostics. */
const SKILL_PRETTY: Record<SocialSkillForNSFW, string> = {
  persuasion: "Persuasion",
  deception: "Deception",
  intimidation: "Intimidation",
  empathy: "Empathy",
  charisma: "Charisma",
  seduction: "Seduction",
};

/**
 * Resolve the actor's social-skill level map for prerequisite checks.
 *
 * Source order (first hit wins):
 *   1. The actor's CHA stat (`character_stats.cha`) — the canonical proxy
 *      for every social skill when no dedicated skill exists.
 *   2. The matching physical seduction skill level (`character_seduction_skills`),
 *      multiplied by 10 to align with the prerequisite scale (e.g. level 6 →
 *      60, matching a "persuasion: 60" requirement).
 * @param db
 * @param actorId - Seduction actor
 * @param skillCategory - The physical category attempted (for the bonus proxy)
 */
async function buildSkillLevels(
  db: Kysely<DB>,
  actorId: string,
  skillCategory: SeductionSkillCategory,
): Promise<Record<SocialSkillForNSFW, number>> {
  const stats = await db
    .selectFrom("character_stats",)
    .select("cha",)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  const chaProxy = stats?.cha ?? 10;

  const skills = await getActorSkills(db, actorId,);
  const byCategory: Partial<Record<SeductionSkillCategory, SeductionSkill>> = {};
  for (const skill of skills) {
    if (byCategory[skill.category] === undefined) {
      byCategory[skill.category] = skill;
    }
  }

  const levelFor = (social: SocialSkillForNSFW,): number => {
    const category = SOCIAL_SKILL_TO_CATEGORY[social];
    const skill = category ? byCategory[category] : undefined;
    if (skill !== undefined) { return skill.level * 10; }
    return chaProxy;
  };

  return {
    persuasion: levelFor("persuasion",),
    deception: levelFor("deception",),
    intimidation: levelFor("intimidation",),
    empathy: levelFor("empathy",),
    charisma: skillCategory === "communication"
      ? (byCategory.communication?.level ?? 0) * 10
      : chaProxy,
    seduction: skillCategory === "communication"
      ? (byCategory.communication?.level ?? 0) * 10
      : chaProxy,
  };
}

/**
 * Tag a free-text approach with the FantasyCategory it invokes (TASK-034).
 *
 * The mapping is name-based: each canonical category matches its own token
 * (e.g. "bondage" → Bondage) plus a small alias set for common wording.
 * Unrecognized approaches return undefined — the attempt proceeds without a
 * fantasy-flag DC adjustment rather than guessing.
 * @param approach - Free-text approach description
 * @returns The invoked FantasyCategory, or undefined when unrecognized
 */
function classifyApproachCategory(approach: string,): FantasyCategory | undefined {
  const text = approach.toLowerCase();
  const aliases: Record<FantasyCategory, string[]> = {
    power_exchange: ["dominan", "submiss", "master", "mistress", "obey",],
    exhibitionism: ["exhibition", "public", "watch me",],
    voyeurism: ["voyeur", "watching", "spying",],
    roleplay: ["roleplay", "role-play", "pretend", "costume",],
    sensation: ["sensation", "feather", "ice", "wax",],
    group: ["group", "threesome", "orgy",],
    taboo: ["taboo", "forbidden",],
    transformation: ["transform", "tf",],
    worship: ["worship", "adore", "devot",],
    pet_play: ["pet play", "petplay", "puppy", "kitten",],
    breeding: ["breed", "pregnan",],
    pain_play: ["pain", "spank", "whip", "flog",],
    bondage: ["bondage", "tie", "bound", "rope", "cuff",],
    service: ["service", "serve", "massage",],
    degradation: ["degrad", "humiliat",],
    praise: ["praise", "compliment", "beautiful",],
  };
  for (const [category, tokens] of Object.entries(aliases,)) {
    if (
      text.includes(category.replaceAll("_", " ",)) ||
      tokens.some((token,) => text.includes(token,))
    ) {
      return category as FantasyCategory;
    }
  }
  return undefined;
}

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
 * Settle a resolved attempt: arousal, dual XP, and mood follow-through.
 *
 * Best-effort on the mood event — a missing mood row must not fail the
 * attempt outcome.
 * @param args
 */
async function settleAttempt(args: {
  db: Kysely<DB>;
  log: ReturnType<typeof getLogger>;
  actorId: string;
  targetId: string;
  skillCategory: SeductionSkillCategory;
  worldId?: string | null;
  relevantSkill: SeductionSkill | undefined;
  success: boolean;
  arousalDelta: number;
  xpGained: number;
  /** Content-intensity tier bounding the arousal ceiling (TASK-034). */
  intensityTier?: ContentIntensity;
},): Promise<void> {
  const { db, log, actorId, targetId, skillCategory, worldId, relevantSkill, success, arousalDelta, xpGained, intensityTier, } = args;
  // Apply arousal change to target (TASK-034): tier ceiling enforced.
  if (arousalDelta !== 0) {
    await modifyArousal(db, targetId, arousalDelta, worldId, `seduction:${skillCategory}`, intensityTier,);
  }

  // Award skill XP (category granularity) + shared-ledger XP (TASK-040).
  // Record the category skill first, then mirror to the shared ledger.
  if (relevantSkill) {
    await awardXp(db, actorId, skillCategory, relevantSkill.name, xpGained,);
    await logXp({ database: db, }, {
      actorId,
      amount: xpGained,
      source: "nsfw_seduction",
      description: `Seduction ${success ? "success" : "failure"} (${skillCategory})`,
      chatId: undefined,
    },);
  }

  // Mood follow-through (TASK-041): one source-tagged event on the target.
  try {
    const mood = MoodService(db,);
    await mood.logEvent({
      actorId: targetId,
      worldId: worldId ?? undefined,
      eventType: success ? "seduction.success" : "seduction.failure",
      happinessDelta: success ? 2 : -1,
      source: "seduction",
      sourceId: `${actorId}:${skillCategory}`,
    },);
  } catch (cause) {
    log.warn(`Mood follow-through skipped for ${targetId}:`, cause instanceof Error ? cause : undefined,);
  }
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

  // Calculate DC based on target's state
  const targetArousal = await getArousal(db, targetId, worldId,);
  const targetDesire = await getDesireProfile(db, targetId,);

  // Base DC 50, modified by target's arousal and desire
  let dc = 50;
  dc -= Math.floor(targetArousal.level * 0.3,); // Arousal makes them easier
  dc -= Math.floor(targetDesire.currentDesire * 0.2,); // Desire makes them easier

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

  await settleAttempt({ db, log, actorId, targetId, skillCategory, worldId, relevantSkill, success, arousalDelta, xpGained, intensityTier: opts.intensityTier, },);

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
