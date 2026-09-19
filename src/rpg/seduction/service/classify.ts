// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { FantasyCategory, SeductionSkillCategory, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import type { SocialSkillForNSFW, } from "../../../nsfw/seduction-prerequisites";
import { getActorSkills, } from "./skills";
import type { SeductionSkill, } from "./types";

/**
 * Bijective map between NSFW social skills and the physical seduction skill
 * categories. When a social skill has no matching physical category (e.g.
 * `intimidation`), it falls back to the actor's CHA-derived proxy.
 */
export const SOCIAL_SKILL_TO_CATEGORY: Record<SocialSkillForNSFW, SeductionSkillCategory | undefined> = {
  persuasion: "communication",
  deception: "roleplay",
  intimidation: "dominance",
  empathy: "aftercare",
  charisma: "communication",
  seduction: "communication",
};

/** Human-readable labels for prerequisite diagnostics. */
export const SKILL_PRETTY: Record<SocialSkillForNSFW, string> = {
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
export async function buildSkillLevels(
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
export function classifyApproachCategory(approach: string,): FantasyCategory | undefined {
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
  for (const [category, tokens,] of Object.entries(aliases,)) {
    if (
      text.includes(category.replaceAll("_", " ",),) ||
      tokens.some((token,) => text.includes(token,))
    ) {
      return category as FantasyCategory;
    }
  }
  return undefined;
}
