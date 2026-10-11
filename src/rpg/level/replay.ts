// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Replay path for the LevelService (split from `award.ts` for the 250-line
 * ceiling): resolve a grant whose ledger row already exists.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { applySheetBenefits, ensureCharacterStats, type LedgerGrant, } from "./award.js";
import { toResult, } from "./result.js";
import { type AwardXpResult, } from "./types.js";

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
