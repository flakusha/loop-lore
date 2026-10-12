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
 * Amount contract: the grant amount MUST be a `number` (string amounts are
 * rejected without coercion), a finite non-negative INTEGER (NaN, ±Infinity,
 * negatives and fractions are rejected), with -0 normalized to +0 and
 * amounts above `Number.MAX_SAFE_INTEGER` clamped to it (integer columns
 * cannot represent the overflow, and precision is already lost).
 *
 * Idempotency & races: the (actor, source, referenceId) key is backed by a
 * UNIQUE index (`056_xp_ledger_dedupe_unique`) and the sheet update + ledger
 * write run in ONE transaction, so concurrent re-entry resolves to a single
 * applied grant — the loser downgrades to a replay, which re-applies the
 * recorded amount only when the sheet is stale (crash between the writes).
 * Grants without a `referenceId` are never deduped.
 *
 * The pre-existing skills `addXp` (per-skill rows in `character_skills`)
 * deliberately stays untouched — this module only owns the CHARACTER
 * progression pipeline (BUG-addxp-accepts-negative-xp is a separate ticket).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { applyGrant, type LedgerGrant, } from "./award.js";
import { isLedgerUniqueViolation, replayGrant, } from "./replay.js";
import { type AwardXpInput, type AwardXpResult, LevelServiceError, } from "./types.js";

export { ensureCharacterStats, } from "./award.js";

/**
 * Award XP to a character through the shared pipeline.
 * @param db
 * @param input
 * @returns The applied (or deduped/reconciled) award outcome.
 * @throws {LevelServiceError} `invalid_amount` when the amount is not a
 *   finite, non-negative integer number (strings are NOT coerced, -0 is
 *   accepted and normalized, values above `Number.MAX_SAFE_INTEGER` are
 *   clamped rather than rejected).
 */
export async function awardXpToActor(
  db: Kysely<DB>,
  input: AwardXpInput,
): Promise<AwardXpResult> {
  const grant = validateGrant(input,);

  try {
    return await db.transaction().execute(async (trx,) => {
      if (grant.referenceId !== undefined) {
        const prior = await findLedgerGrant(trx, grant,);
        if (prior) {
          return replayGrant(trx, grant, prior.id,);
        }
      }

      return applyGrant(trx, grant,);
    },);
  } catch (cause) {
    if (grant.referenceId !== undefined && isLedgerUniqueViolation(cause,)) {
      // A concurrent call won the unique key between our pre-check and the
      // ledger insert; our (rolled-back) attempt downgrades to a replay.
      return db.transaction().execute(async (trx,) => {
        const prior = await findLedgerGrant(trx, grant,);
        if (!prior) { throw cause; }
        return replayGrant(trx, grant, prior.id,);
      },);
    }

    throw cause;
  }
}

/**
 * Validate and normalize the grant: reject non-numbers (strings are never
 * coerced), non-finite, negative and fractional amounts; normalize -0 to +0;
 * clamp to the safe-integer ceiling.
 * @param input
 */
function validateGrant(input: AwardXpInput,): LedgerGrant {
  const { amount, } = input;
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount,) ||
    amount < 0 ||
    !Number.isInteger(amount,)
  ) {
    throw new LevelServiceError(
      `Invalid XP amount ${String(amount,)}: must be a finite, non-negative integer number`,
      "invalid_amount",
    );
  }

  return {
    actorId: input.actorId,
    // Normalize -0 to +0; clamp to the integer ceiling the columns can hold.
    amount: Math.min(amount === 0 ? 0 : amount, Number.MAX_SAFE_INTEGER,),
    source: input.source,
    description: input.description,
    referenceId: input.referenceId,
    chatId: input.chatId,
  };
}

/**
 * Locate the dedupe-key ledger row for a referenced grant. Two call sites
 * (pre-check and unique-violation recovery) must match the UNIQUE index
 * columns exactly, hence the shared projection.
 * @param db
 * @param grant
 */
function findLedgerGrant(
  db: Kysely<DB>,
  grant: LedgerGrant,
): Promise<{ id: string } | undefined> {
  return db
    .selectFrom("xp_ledger",)
    .select("id",)
    .where("actor_id", "=", grant.actorId,)
    .where("source", "=", grant.source,)
    .where("reference_id", "=", grant.referenceId!,)
    .executeTakeFirst();
}
