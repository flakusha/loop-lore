// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LevelService — apply awarded XP to `character_stats` and level-up benefits.
 *
 * One pipeline every XP source goes through: validate the amount, dedupe on
 * (actor, source, referenceId), read/ensure the character's stats row, run
 * the pure `awardXp` math from `src/rpg/xp/calculation.ts`, apply level-up
 * benefits (`hpOnLevelUp`, ASI budget from `grantsAsi`), persist the new
 * level/xp/xp_to_next, and write the `xp_ledger` audit row via the shared
 * ledger service.
 *
 * The pre-existing skills `addXp` (per-skill rows in `character_skills`)
 * deliberately stays untouched — this module only owns the CHARACTER
 * progression pipeline (BUG-addxp-accepts-negative-xp is a separate ticket).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { safeJsonParse, } from "../../utils.js";
import { createCharacterStats, updateCharacterStats, } from "../service/character-stats.js";
import { logXp, } from "../service/xp.js";
import { abilityModifier, } from "../stats/modifiers.js";
import { awardXp, xpToNextLevel, } from "../xp/calculation.js";
import { grantsAsi, hpOnLevelUp, } from "../xp/levelup.js";
import { autoResolveIfAutonomous, stageLevelUpDecision, } from "./decisions.js";
import { applyOrganicGrowth, } from "./growth.js";
import {
  type AwardXpInput,
  type AwardXpResult,
  DEFAULT_HIT_DIE,
  ENSURED_STATS_DEFAULTS,
  LevelServiceError,
  XP_TO_NEXT_MAX_SENTINEL,
} from "./types.js";

/** Raw `character_stats` row as the pipeline needs it. */
interface StatsRow {
  id: string;
  actor_id: string;
  level: number;
  hp: number;
  max_hp: number;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  hit_dice: string;
  xp: number;
  xp_to_next: number;
  pending_asi: number;
}

/**
 * Read the actor's stats row, creating a baseline row when none exists.
 *
 * "Read/ensure" contract from the LevelService ticket: every XP source can
 * assume a row after this call, so first-time awarders (a battle NPC's first
 * fight, a fresh discovery actor) never need their own bootstrap path.
 * @param db
 * @param actorId
 * @returns The actor's (possibly just-created) stats row.
 * @throws {LevelServiceError} `stats_unavailable` when the ensured row still
 *   cannot be read back.
 */
export async function ensureCharacterStats(
  db: Kysely<DB>,
  actorId: string,
): Promise<StatsRow> {
  const existing = await readStats(db, actorId,);
  if (existing) { return existing; }

  await createCharacterStats({ database: db, }, {
    actorId,
    hp: ENSURED_STATS_DEFAULTS.hp,
    maxHp: ENSURED_STATS_DEFAULTS.maxHp,
    ac: ENSURED_STATS_DEFAULTS.ac,
  },);

  const created = await readStats(db, actorId,);
  if (!created) {
    throw new LevelServiceError(
      `character_stats row for actor ${actorId} could not be ensured`,
      "stats_unavailable",
    );
  }

  return created;
}

/**
 * Award XP to a character through the shared pipeline.
 *
 * Validation rejects NaN/negative/Infinity amounts BEFORE anything is
 * written — the ledger and the character sheet must never disagree. With a
 * `referenceId` the grant is idempotent per (actor, source, referenceId):
 * a replay resolves to the already-recorded state and applies nothing.
 * @param db
 * @param input
 * @returns The applied (or deduped) award outcome.
 * @throws {LevelServiceError} `invalid_amount` when the amount is NaN,
 *   negative, or not finite.
 */
export async function awardXpToActor(
  db: Kysely<DB>,
  input: AwardXpInput,
): Promise<AwardXpResult> {
  if (!Number.isFinite(input.amount,) || input.amount < 0) {
    throw new LevelServiceError(
      `Invalid XP amount ${input.amount}: must be a finite, non-negative number`,
      "invalid_amount",
    );
  }

  if (input.referenceId !== undefined) {
    const prior = await db
      .selectFrom("xp_ledger",)
      .select("id",)
      .where("actor_id", "=", input.actorId,)
      .where("source", "=", input.source,)
      .where("reference_id", "=", input.referenceId,)
      .executeTakeFirst();

    if (prior) {
      const stats = await ensureCharacterStats(db, input.actorId,);

      return toResult({
        ledgerId: prior.id,
        actorId: input.actorId,
        stats,
        previousLevel: stats.level,
        hpGained: 0,
        asiGranted: 0,
        deduped: true,
      },);
    }
  }

  const before = await ensureCharacterStats(db, input.actorId,);
  const applied = awardXp(before.level, before.xp, input.amount,);
  // Never decrease a persisted level, even if the stored level/xp pair was
  // inconsistent with the threshold table (defensive; the math is xp-driven).
  const newLevel = Math.max(before.level, applied.newLevel,);

  const hitDie = parseHitDie(before.hit_dice,);
  const conMod = abilityModifier(before.con,);

  let hpGained = 0;
  let asiGranted = 0;
  for (let level = before.level + 1; level <= newLevel; level++) {
    hpGained += hpOnLevelUp(hitDie, conMod,);
    if (grantsAsi(level,)) { asiGranted += 1; }
  }

  const nextXpToNext = xpToNextLevel(newLevel, applied.newXp,);
  const persistedXpToNext = Number.isFinite(nextXpToNext,)
    ? nextXpToNext
    : XP_TO_NEXT_MAX_SENTINEL;

  await updateCharacterStats({ database: db, }, before.id, {
    level: newLevel,
    xp: applied.newXp,
    xpToNext: persistedXpToNext,
    maxHp: before.max_hp + hpGained,
    // The level-up HP is applied on top of current HP but never overflows
    // the new maximum (a wounded character is healed by the roll, not past it).
    hp: Math.min(before.hp + hpGained, before.max_hp + hpGained,),
    pendingAsi: before.pending_asi + asiGranted,
  },);

  // Organic drift: one activity-weighted ability point per level gained,
  // applied after the HP bookkeeping (the roll above used the pre-drift
  // CON modifier — drift never retroactively re-rolls earlier levels).
  for (let i = 0; i < applied.levelsGained; i++) {
    await applyOrganicGrowth(db, input.actorId,);
  }

  // Stage the level-up decision surface for the ASI budget: a chat question
  // when the award carries a chat, and an immediate affinity spend for
  // autonomous actors so a threshold never blocks an LLM turn.
  if (asiGranted > 0) {
    await stageLevelUpDecision(db, input.actorId, input.chatId,);
    await autoResolveIfAutonomous(db, input.actorId,);
  }

  const ledgerId = await logXp({ database: db, }, {
    actorId: input.actorId,
    amount: input.amount,
    source: input.source,
    description: input.description,
    referenceId: input.referenceId,
    chatId: input.chatId,
  },);

  const after = await readStats(db, input.actorId,);

  return toResult({
    ledgerId,
    actorId: input.actorId,
    stats: after ?? { ...before, level: newLevel, xp: applied.newXp, },
    previousLevel: before.level,
    hpGained,
    asiGranted,
    deduped: false,
  },);
}

// ── Internals ────────────────────────────────────────────

async function readStats(db: Kysely<DB>, actorId: string,): Promise<StatsRow | null> {
  const row = await db
    .selectFrom("character_stats",)
    .where("actor_id", "=", actorId,)
    .select([
      "id",
      "actor_id",
      "level",
      "hp",
      "max_hp",
      "str",
      "dex",
      "con",
      "int",
      "wis",
      "cha",
      "hit_dice",
      "xp",
      "xp_to_next",
      "pending_asi",
    ],)
    .executeTakeFirst();

  return row ?? null;
}

function toResult(params: {
  ledgerId: string;
  actorId: string;
  stats: StatsRow;
  previousLevel: number;
  hpGained: number;
  asiGranted: number;
  deduped: boolean;
},): AwardXpResult {
  const { stats, previousLevel, } = params;
  const raw = xpToNextLevel(stats.level, stats.xp,);

  return {
    ledgerId: params.ledgerId,
    actorId: params.actorId,
    previousLevel,
    level: stats.level,
    xp: stats.xp,
    xpToNext: Number.isFinite(raw,) ? raw : null,
    leveledUp: stats.level > previousLevel,
    levelsGained: stats.level - previousLevel,
    hpGained: params.hpGained,
    asiGranted: params.asiGranted,
    deduped: params.deduped,
  };
}

/**
 * Parse the hit die out of the `hit_dice` JSON column.
 * Accepts `{ "die": N }` (and tolerates the `'{}'` default), falling back to
 * the d8 baseline for rows that never recorded a die size.
 * @param raw
 * @returns Hit die size (minimum d1, default d8).
 */
function parseHitDie(raw: string,): number {
  const parsed = safeJsonParse<{ die?: unknown; hitDie?: unknown }>(raw,);
  const candidate = parsed.ok
    ? parsed.value.die ?? parsed.value.hitDie
    : undefined;

  return typeof candidate === "number" && Number.isFinite(candidate,) && candidate >= 1
    ? Math.floor(candidate,)
    : DEFAULT_HIT_DIE;
}
