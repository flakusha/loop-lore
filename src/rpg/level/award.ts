// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Award internals for the LevelService (FEAT-levelservice).
 *
 * Split from `service.ts` so the orchestrator stays under the 250-line
 * ceiling. Everything here runs INSIDE the caller's transaction: the grant
 * applies sheet benefits and appends the ledger row, the replay path
 * reconciles a sheet that is stale relative to an already-recorded ledger
 * row (crash between the two writes, or a lost sheet).
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
export interface StatsRow {
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

/** The ledger fields the replay/reconcile path needs. */
export type LedgerGrant = Pick<AwardXpInput, "actorId" | "source" | "referenceId" | "description" | "chatId"> & {
  /** Validated, clamped amount. */
  amount: number;
};

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
 * Re-apply a recorded grant to a stale sheet and return the outcome parts.
 * Shared by the apply and replay paths so the benefit math (HP, ASI, drift,
 * decision staging) can never drift apart.
 * @param db Transaction-scoped handle.
 * @param stats Current sheet row (already ensured).
 * @param grant
 */
async function applySheetBenefits(
  db: Kysely<DB>,
  stats: StatsRow,
  grant: LedgerGrant,
): Promise<{ hpGained: number; asiGranted: number; stats: StatsRow }> {
  const applied = awardXp(stats.level, stats.xp, grant.amount,);
  // Never decrease a persisted level, even if the stored level/xp pair was
  // inconsistent with the threshold table (defensive; the math is xp-driven).
  const newLevel = Math.max(stats.level, applied.newLevel,);

  const hitDie = parseHitDie(stats.hit_dice,);
  const conMod = abilityModifier(stats.con,);

  let hpGained = 0;
  let asiGranted = 0;
  for (let level = stats.level + 1; level <= newLevel; level++) {
    hpGained += hpOnLevelUp(hitDie, conMod,);
    if (grantsAsi(level,)) { asiGranted += 1; }
  }

  const nextXpToNext = xpToNextLevel(newLevel, applied.newXp,);
  const persistedXpToNext = Number.isFinite(nextXpToNext,)
    ? nextXpToNext
    : XP_TO_NEXT_MAX_SENTINEL;

  await updateCharacterStats({ database: db, }, stats.id, {
    level: newLevel,
    xp: applied.newXp,
    xpToNext: persistedXpToNext,
    maxHp: stats.max_hp + hpGained,
    // The level-up HP is applied on top of current HP but never overflows
    // the new maximum (a wounded character is healed by the roll, not past it).
    hp: Math.min(stats.hp + hpGained, stats.max_hp + hpGained,),
    pendingAsi: stats.pending_asi + asiGranted,
  },);

  // Organic drift: one activity-weighted ability point per level gained,
  // applied after the HP bookkeeping (the roll above used the pre-drift
  // CON modifier — drift never retroactively re-rolls earlier levels).
  for (let i = 0; i < newLevel - stats.level; i++) {
    await applyOrganicGrowth(db, grant.actorId,);
  }

  // Stage the level-up decision surface for the ASI budget: a chat question
  // when the award carries a chat, and an immediate affinity spend for
  // autonomous actors so a threshold never blocks an LLM turn.
  if (asiGranted > 0) {
    await stageLevelUpDecision(db, grant.actorId, grant.chatId,);
    await autoResolveIfAutonomous(db, grant.actorId,);
  }

  const after = await readStats(db, grant.actorId,);
  return {
    hpGained,
    asiGranted,
    stats: after ?? { ...stats, level: newLevel, xp: applied.newXp, },
  };
}

/**
 * Apply the full grant: sheet benefits (level/xp/HP/ASI), organic drift and
 * decision staging, then the ledger row. Caller owns the transaction.
 * @param db Transaction-scoped handle.
 * @param grant
 */
export async function applyGrant(db: Kysely<DB>, grant: LedgerGrant,): Promise<AwardXpResult> {
  const before = await ensureCharacterStats(db, grant.actorId,);
  const { hpGained, asiGranted, stats, } = await applySheetBenefits(db, before, grant,);

  const ledgerId = await logXp({ database: db, }, {
    actorId: grant.actorId,
    amount: grant.amount,
    source: grant.source,
    description: grant.description,
    referenceId: grant.referenceId,
    chatId: grant.chatId,
  },);

  return toResult({
    ledgerId,
    actorId: grant.actorId,
    stats,
    previousLevel: before.level,
    hpGained,
    asiGranted,
    deduped: false,
  },);
}

/**
 * Resolve a replay: the ledger row already exists for the dedupe key.
 * If the sheet is stale relative to the recorded grant (crash between the
 * ledger insert and the sheet write, or a deleted/lost sheet), re-apply the
 * recorded amount; staleness is approximated by `sheet.xp < recorded amount`
 * — a sheet that already banked the grant (or more) is left untouched.
 * @param db Transaction-scoped handle.
 * @param grant
 * @param ledgerId The already-recorded ledger row id.
 */
export async function replayGrant(db: Kysely<DB>, grant: LedgerGrant, ledgerId: string,): Promise<AwardXpResult> {
  const stats = await ensureCharacterStats(db, grant.actorId,);

  if (stats.xp < grant.amount) {
    // Reconcile: apply the recorded amount to the stale sheet. The ledger
    // row stays untouched — the audit trail already contains it.
    const { hpGained, asiGranted, stats: after, } = await applySheetBenefits(db, stats, grant,);

    return toResult({
      ledgerId,
      actorId: grant.actorId,
      stats: after,
      previousLevel: stats.level,
      hpGained,
      asiGranted,
      deduped: true,
    },);
  }

  return toResult({
    ledgerId,
    actorId: grant.actorId,
    stats,
    previousLevel: stats.level,
    hpGained: 0,
    asiGranted: 0,
    deduped: true,
  },);
}

/**
 * Detect the (actor, source, reference_id) unique-constraint violation from
 * a concurrent winner so the loser can downgrade to a replay.
 * @param cause
 */
export function isLedgerUniqueViolation(cause: unknown,): boolean {
  const code = (cause as { code?: unknown } | null)?.code;
  const message = cause instanceof Error ? cause.message : String(cause ?? "",);
  return (
    (code === "SQLITE_CONSTRAINT_UNIQUE" || /UNIQUE constraint failed/.test(message,)) &&
    /xp_ledger/.test(message,)
  );
}

export async function readStats(db: Kysely<DB>, actorId: string,): Promise<StatsRow | null> {
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

export function toResult(params: {
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
export function parseHitDie(raw: string,): number {
  const parsed = safeJsonParse<{ die?: unknown; hitDie?: unknown }>(raw,);
  const candidate = parsed.ok
    ? parsed.value.die ?? parsed.value.hitDie
    : undefined;

  return typeof candidate === "number" && Number.isFinite(candidate,) && candidate >= 1
    ? Math.floor(candidate,)
    : DEFAULT_HIT_DIE;
}
