// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Allocatable ASI points (FEAT-automatic-organic-stat-growth).
 *
 * Points staged by the LevelService on ASI levels (4/8/12/16/19) are spent
 * here: validate the request, clamp to `ASI_MAX` (20) and the pending
 * budget, and persist ability + remaining budget on `character_stats`.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { updateCharacterStats, } from "../service/character-stats.js";
import { type AbilityName, } from "../stats/types.js";
import { ASI_MAX, } from "../xp/constants.js";
import { readStats, } from "./award.js";
import { LevelServiceError, } from "./types.js";

/** Input for {@link allocateAsi}. */
export interface AllocateAsiInput {
  actorId: string;
  ability: AbilityName;
  /** Points to spend; defaults to 1. Clamped to budget and ASI_MAX. */
  points?: number;
}

/** Outcome of one allocation. */
export interface AllocateAsiResult {
  actorId: string;
  ability: AbilityName;
  /** Points actually applied (after clamping). */
  granted: number;
  /** Ability score after the grant. */
  value: number;
  /** Unspent pending points left on the character. */
  remaining: number;
}

/**
 * Read the actor's allocation-relevant stats row.
 * @param db
 * @param actorId
 */
async function readAllocationRow(db: Kysely<DB>, actorId: string,): Promise<
  {
    id: string;
    pending_asi: number;
  } & Record<AbilityName, number> | null
> {
  const row = await readStats(db, actorId,);
  if (!row) { return null; }
  const { id, pending_asi, str, dex, con, int, wis, cha, } = row;
  return { id, pending_asi, str, dex, con, int, wis, cha, };
}

/**
 * Spend pending ASI points on one ability.
 * @param db
 * @param input
 * @returns The applied grant and the remaining budget.
 * @throws {LevelServiceError} `invalid_ability` for an unknown ability key,
 *   `no_pending_asi` when the budget is empty, `asi_capped` when the ability
 *   is already at `ASI_MAX`, `invalid_amount` for non-positive point asks.
 */
export async function allocateAsi(
  db: Kysely<DB>,
  input: AllocateAsiInput,
): Promise<AllocateAsiResult> {
  const row = await readAllocationRow(db, input.actorId,);
  if (!row) {
    throw new LevelServiceError(
      `No character_stats row for actor ${input.actorId}`,
      "stats_unavailable",
    );
  }

  if (!(input.ability in row)) {
    throw new LevelServiceError(
      `Unknown ability '${String(input.ability,)}'`,
      "invalid_ability",
    );
  }

  const points = input.points ?? 1;
  if (!Number.isFinite(points,) || points < 1) {
    throw new LevelServiceError(
      `Invalid ASI point ask ${points}: must be a positive number`,
      "invalid_amount",
    );
  }

  if (row.pending_asi <= 0) {
    throw new LevelServiceError(
      `Actor ${input.actorId} has no pending ASI points`,
      "no_pending_asi",
    );
  }

  const current = row[input.ability];
  const headroom = ASI_MAX - current;
  if (headroom <= 0) {
    throw new LevelServiceError(
      `Ability '${input.ability}' is already at ASI_MAX (${ASI_MAX})`,
      "asi_capped",
    );
  }

  const granted = Math.min(Math.floor(points,), row.pending_asi, headroom,);
  await updateAllocation(db, row.id, input.ability, current + granted, row.pending_asi - granted,);

  return {
    actorId: input.actorId,
    ability: input.ability,
    granted,
    value: current + granted,
    remaining: row.pending_asi - granted,
  };
}

async function updateAllocation(
  db: Kysely<DB>,
  statsId: string,
  ability: AbilityName,
  value: number,
  remaining: number,
): Promise<void> {
  await updateCharacterStats({ database: db, }, statsId, {
    [ability]: value,
    pendingAsi: remaining,
  },);
}
