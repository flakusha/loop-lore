// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Skill-usage XP leg (FEAT-skill-usage).
 *
 * When an interaction skill check resolves, the exercised skill pays out on
 * two stores: the matching `character_skills` row (via the shared row helper)
 * and the character sheet (via the shared LevelService pipeline, source
 * `skill_use`). The two awards are independent — a missing skill row skips
 * only the row half, a LevelService rejection skips only the pipeline half.
 *
 * Best-effort like every reward leg: the interaction already persisted, so a
 * reward failure is logged and swallowed rather than failing resolution.
 * Idempotency rides the interaction log id: one (actor, `skill_use`,
 * interaction-id) ledger key per resolution, so a retried hook cannot
 * double-pay.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { getLogger, } from "../../logger";
import { awardXpToActor, } from "../level/index.js";
import { getCharacterStats, } from "../service/character-stats.js";
import { checkMechanicEnabled, RpgMechanic, } from "../service/world-gate.js";
import { getActorSkills, } from "../skills/service/crud.js";
import { addXp as addSkillRowXp, } from "../skills/service/progression.js";
import { xpForSkillChallenge, } from "../xp/sources.js";
import { getInteractionAbility, } from "./modifiers.js";

/** Input for the skill-usage XP leg. */
export interface SkillUsageXpInput {
  /** Resolved interaction id — the ledger reference, so retries stay idempotent. */
  interactionId: string;
  actorId: string;
  worldId: string | null;
  chatId: string;
  /** Skill name exercised by the check (interaction `skill`). */
  skill: string;
  /** Check DC — mapped onto the easy/medium/hard ladder. */
  difficulty: number;
  /** Whether the check succeeded — failures pay nothing. */
  success: boolean;
}

/**
 * Map a check DC onto the `xpForSkillChallenge` difficulty ladder.
 * @param dc - the check difficulty class
 * @returns easy (<=10), medium (<=15), or hard
 */
export function difficultyForDc(dc: number,): "easy" | "medium" | "hard" {
  if (dc <= 10) { return "easy"; }
  if (dc <= 15) { return "medium"; }
  return "hard";
}

/**
 * Pay the skill-usage XP award for a resolved interaction check.
 * @param db
 * @param input
 * @returns {Promise<void>}
 */
export async function awardSkillUsageXp(
  db: Kysely<DB>,
  input: SkillUsageXpInput,
): Promise<void> {
  const log = getLogger().child({ module: "skill-usage-xp", },);
  try {
    if (!input.success) { return; }

    // Per-world rpg_xp opt-in (FEAT-gate-xp): no world context means no gate
    // to consult, so world-less resolutions stay fail-open like the chat gate.
    if (input.worldId) {
      const gate = await checkMechanicEnabled(db, input.worldId, RpgMechanic.Xp,);
      if (!gate.allowed) {
        log.debug("Skill-usage XP skipped: world opted out", {
          worldId: input.worldId,
          actorId: input.actorId,
        },);

        return;
      }
    }

    // Read (never ensure) the actor's sheet for the payout level: the award
    // pipeline bootstraps missing rows inside its own transaction.
    const stats = await getCharacterStats({ database: db, }, input.actorId,);
    const amount = xpForSkillChallenge(stats?.level ?? 1, difficultyForDc(input.difficulty,),);

    // Row half: exact name match first, then the exercised skill's ability
    // family. A generic interaction skill with no ability mapping pays no
    // row XP — only the character-sheet half below.
    const ability = getInteractionAbility(input.skill,);
    if (ability) {
      try {
        const skills = await getActorSkills(db, input.actorId, input.worldId ?? undefined,);
        const match = skills.find((s,) => s.name.toLowerCase() === input.skill.toLowerCase()) ??
          skills.find((s,) => getInteractionAbility(s.name,) === ability);

        if (match) {
          await addSkillRowXp(db, match.id, amount,);
        }
      } catch (cause) {
        // The skill row is the secondary store: its failure must not starve
        // the character-sheet award below.
        log.warn(`Skill-row XP skipped for ${input.actorId} skill ${input.skill}:`, {
          error: cause instanceof Error ? cause.message : String(cause,),
        },);
      }
    }

    await awardXpToActor(db, {
      actorId: input.actorId,
      amount,
      source: "skill_use",
      referenceId: input.interactionId,
      chatId: input.chatId,
      description: `Skill use: ${input.skill}`,
    },);
  } catch (cause) {
    log.warn(`Skill-usage XP skipped for ${input.actorId}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}
