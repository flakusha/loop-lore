// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { isLedgerUniqueViolation, } from "../../level/replay.js";
import { LevelServiceError, } from "../../level/types.js";
import { logXp, } from "../../service/xp.js";
import { encodeReferencePair, XpSource, } from "../../xp/sources.js";
import { getSkill, } from "./crud";
import { calculateLevel, calculateProficiency, getLog, } from "./helpers";
import { auditSkillLevelUp, } from "./skill-audit";
import type { Skill, XpGainResult, } from "./types";
import { ProficiencyLevel, } from "./types";

/**
 * Add XP to a skill
 * @param db
 * @param skillId
 * @param xpAmount
 * @param opts Optional ledger provenance (`chatId`, `description`).
 * Shared guard + ledger + audit path with the character pipeline (see
 * `src/rpg/level/service.ts`): amounts must be finite non-negative
 * integers (no fractional skill XP exists in any caller); rejects with
 * `LevelServiceError` (`invalid_amount`) before any write, dedupes repeat
 * awards on (actor, `skill_usage`, skill+amount) via the shared `xp_ledger`
 * table, and best-effort audits each level gained. Skill rows stay in
 * `character_skills` — this never writes `character_stats` (no fan-out).
 * @throws {LevelServiceError} When the amount is invalid.
 * @throws {Error} When the skill is missing.
 * @returns {Promise<XpGainResult>}
 */
export async function addXp(
  db: Kysely<DB>,
  skillId: string,
  xpAmount: number,
  opts: { chatId?: string; description?: string } = {},
): Promise<XpGainResult> {
  if (
    typeof xpAmount !== "number" ||
    !Number.isFinite(xpAmount,) ||
    xpAmount < 0 ||
    !Number.isInteger(xpAmount,)
  ) {
    // Shared contract with LevelService.validateGrant: `invalid_amount`,
    // same `Invalid XP amount ...` message prefix (imported, no cycle —
    // level/types.ts is a type-only module w.r.t. the skill tree).
    throw new LevelServiceError(
      `Invalid XP amount ${String(xpAmount,)}: must be a finite, non-negative integer number`,
      "invalid_amount",
    );
  }

  const amount = Math.min(xpAmount === 0 ? 0 : xpAmount, Number.MAX_SAFE_INTEGER,);

  const skill = await getSkill(db, skillId,);
  if (!skill) { throw new Error("Skill not found",); }

  // Idempotent re-award via the shared ledger: the UNIQUE index on
  // (actor, source, reference) with reference = [skillId, amount] backs
  // this pre-check, and a concurrent winner resolves to a replay below.
  const ledgerKey = encodeReferencePair(skillId, amount,);

  try {
    return await db.transaction().execute(async (trx,) => {
      const prior = await trx
        .selectFrom("xp_ledger",)
        .select("id",)
        .where("actor_id", "=", skill.actorId,)
        .where("source", "=", XpSource.SkillUsage,)
        .where("reference_id", "=", ledgerKey,)
        .executeTakeFirst();

      if (prior) { return replayedSkillXp(trx, skillId,); }

      return applySkillGrant(trx, {
        skill,
        amount,
        ledgerKey,
        chatId: opts.chatId,
        description: opts.description,
      },);
    },);
  } catch (cause) {
    if (!isLedgerUniqueViolation(cause,)) { throw cause; }

    // A concurrent call won the unique key between our pre-check and the
    // insert; its commit already applied the grant, so replay, not re-apply.
    return db.transaction().execute(async (trx,) => replayedSkillXp(trx, skillId,));
  }
}

/** Applied-grant context threaded through the helpers below. */
interface SkillGrant {
  skill: Skill;
  amount: number;
  ledgerKey: string;
  chatId?: string;
  description?: string;
}

/**
 * Apply one skill-XP grant inside the caller's transaction: update the
 * `character_skills` row, append the shared `xp_ledger` row (actor = skill
 * owner, source `skill_usage`), and best-effort audit each level gained.
 * Never writes `character_stats` — no fan-out to character XP.
 * @param trx Transaction-scoped handle.
 * @param grant Validated grant fields.
 */
async function applySkillGrant(trx: Kysely<DB>, grant: SkillGrant,): Promise<XpGainResult> {
  const { skill, amount, } = grant;
  const oldLevel = skill.level;
  const oldProficiency = skill.proficiency;
  const newXp = skill.xp + amount;
  const newLevel = calculateLevel(newXp,);
  const newProficiency = calculateProficiency(newXp,);

  const leveledUp = newLevel > oldLevel;
  const proficiencyChanged = newProficiency !== oldProficiency;

  await trx
    .updateTable("character_skills",)
    .set({
      xp: newXp,
      level: newLevel,
      proficiency: newProficiency,
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", skill.id,)
    .execute();

  await logXp({ database: trx, }, {
    actorId: skill.actorId,
    amount,
    source: XpSource.SkillUsage,
    description: grant.description ?? `Skill XP: ${skill.name}`,
    referenceId: grant.ledgerKey,
    chatId: grant.chatId,
  },);

  if (leveledUp) {
    getLog().info("Skill leveled up", {
      skillId: skill.id,
      name: skill.name,
      oldLevel,
      newLevel,
    },);

    await auditSkillLevelUp(trx, skill.actorId, skill.id, oldLevel, newLevel, skill.name,);
  }

  if (proficiencyChanged) {
    getLog().info("Skill proficiency changed", {
      skillId: skill.id,
      name: skill.name,
      oldProficiency,
      newProficiency,
    },);
  }

  return {
    skillId: skill.id,
    xpGained: amount,
    totalXp: newXp,
    newLevel,
    newProficiency,
    leveledUp,
    proficiencyChanged,
  };
}

/**
 * Resolve a re-award: the ledger already recorded this (skill, amount)
 * grant, so return the stored outcome without double-writing skill XP.
 * @param trx Transaction-scoped handle.
 * @param skillId
 */
async function replayedSkillXp(trx: Kysely<DB>, skillId: string,): Promise<XpGainResult> {
  const current = (await getSkill(trx, skillId,))!;
  return {
    skillId,
    xpGained: 0,
    totalXp: current.xp,
    newLevel: current.level,
    newProficiency: current.proficiency,
    leveledUp: false,
    proficiencyChanged: false,
  };
}

/**
 * Specialize a skill
 * @param db
 * @param skillId
 * @param specialization
 * @throws {Error} When the skill is missing or not at Expert level.
 * @returns {Promise<Skill>}
 */
export async function specializeSkill(db: Kysely<DB>, skillId: string, specialization: string,): Promise<Skill> {
  const skill = await getSkill(db, skillId,);
  if (!skill) { throw new Error("Skill not found",); }

  if (
    skill.proficiency !== ProficiencyLevel.Expert &&
    skill.proficiency !== ProficiencyLevel.Master &&
    skill.proficiency !== ProficiencyLevel.Grandmaster
  ) {
    throw new Error("Skill must be at least Expert level to specialize",);
  }

  await db
    .updateTable("character_skills",)
    .set({
      specialization,
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", skillId,)
    .execute();

  getLog().info("Skill specialized", { skillId, name: skill.name, specialization, },);

  return (await getSkill(db, skillId,))!;
}
