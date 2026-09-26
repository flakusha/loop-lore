// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Spend-on-reroll helpers — opt-in guard for dice reroll and generation
 * retry paths. The caller decides whether to charge story points by
 * passing `opts.spendStoryPoints = true` plus `cost`. If no actorCtx is
 * supplied, the guard silently no-ops (free reroll).
 *
 * This module does NOT mutate the reroll/retry signatures — the public
 * functions remain backward compatible. The hook returns a status object
 * so the calling surface can decide whether to abort on insufficient
 * balance.
 *
 * @module services/agency/spend-helpers
 */
import { type Kysely, } from "kysely";
import type { DB, } from "../../db";
import {
  InsufficientStoryPointsError,
  spendStoryPoints,
} from "./story-points";

/** Caller-supplied actor context. */
export interface ActorCtx {
  actorId: string;
  worldId?: string | null;
}

/** Opt-in guard options. */
export interface TrySpendOpts {
  /** When true, attempt the spend. Default false (no-op). */
  spendStoryPoints?: boolean;
  /** Story-point cost. Default 1. Must be a positive integer when set. */
  cost?: number;
  /** Free-form reason recorded on the ledger row. */
  reason?: string;
}

/** Result of the guard. `ok === false` blocks the reroll/retry. */
export interface TrySpendResult {
  ok: boolean;
  charged: boolean;
  cost: number;
  reason: "ok" | "no-actor" | "no-opt-in" | "insufficient" | "error";
  message?: string;
}

const NO_OP: TrySpendResult = { ok: true, charged: false, cost: 0, reason: "no-opt-in", };

/**
 * Try to spend `opts.cost` story points (default 1) for an actor. When
 * `opts.spendStoryPoints !== true` or `actorCtx` is missing, returns a
 * no-op `ok: true` result so callers can use the helper unconditionally.
 *
 * Errors thrown by `spendStoryPoints` are caught and surfaced as
 * `reason: "insufficient"` (or `"error"` for unknown failures).
 *
 * @param db
 * @param actorCtx
 * @param opts
 */
export async function trySpendForReroll(
  db: Kysely<DB>,
  actorCtx: ActorCtx | null | undefined,
  opts: TrySpendOpts = {},
): Promise<TrySpendResult> {
  if (!opts.spendStoryPoints) { return NO_OP; }
  if (!actorCtx || !actorCtx.actorId) {
    return { ok: true, charged: false, cost: 0, reason: "no-actor", };
  }
  const cost = opts.cost ?? 1;
  if (!Number.isInteger(cost,) || cost <= 0) {
    return { ok: false, charged: false, cost: 0, reason: "error", message: `invalid cost: ${cost}`, };
  }
  try {
    await spendStoryPoints(db, {
      actorId: actorCtx.actorId,
      worldId: actorCtx.worldId ?? null,
      amount: cost,
      reason: opts.reason ?? "reroll",
    },);
    return { ok: true, charged: true, cost, reason: "ok", };
  } catch (err) {
    if (err instanceof InsufficientStoryPointsError) {
      return {
        ok: false,
        charged: false,
        cost,
        reason: "insufficient",
        message: `Not enough story points (have ${err.available}, need ${cost}).`,
      };
    }
    const msg = err instanceof Error ? err.message : String(err,);
    return { ok: false, charged: false, cost, reason: "error", message: msg, };
  }
}
