// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type StatBlock, } from "../stats/types.js";
import { validateStatBlock, } from "../stats/validation.js";
import { assertTraitIds, getTraitsForWorld, } from "../traits/catalog.js";
import type { RpgServiceDeps, } from "./types.js";

/** Stored allocation row with assigned trait ids */
export interface StatAllocation {
  actorId: string;
  worldId: string;
  stats: StatBlock;
  traitIds: string[];
  allocatedAt: string;
  allocatedByUserId: string | null;
}

/** World stat-requirement config */
interface WorldStatConfig {
  requiresStats: number;
  statPointBudget: number;
  statMin: number;
  statMax: number;
}

/** Point-buy cost table (matches src/rpg/stats/generation.ts) */
const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

/** Validation failure */
export class AllocationValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string,) {
    super(message,);
    this.code = code;
  }
}

async function readWorldConfig(deps: RpgServiceDeps, worldId: string,): Promise<WorldStatConfig | null> {
  const row = await deps.database
    .selectFrom("worlds",)
    .select(["requires_stats", "stat_point_budget", "stat_min", "stat_max",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  return {
    requiresStats: row.requires_stats,
    statPointBudget: row.stat_point_budget,
    statMin: row.stat_min,
    statMax: row.stat_max,
  };
}

/**
 * Validate a stat block + trait ids against world config and catalog.
 * @param deps
 * @param worldId
 * @param stats
 * @param traitIds
 * @throws AllocationValidationError on any rule violation
 */
export async function validateAllocation(
  deps: RpgServiceDeps,
  worldId: string,
  stats: StatBlock,
  traitIds: readonly string[],
): Promise<void> {
  const config = await readWorldConfig(deps, worldId,);
  if (config === null) {
    throw new AllocationValidationError("unknown_world", `Unknown world: ${worldId}`,);
  }

  if (!validateStatBlock(stats,)) {
    throw new AllocationValidationError("stat_range", "Stat values must be within [1, 30]",);
  }

  const abilities = ["str", "dex", "con", "int", "wis", "cha",] as const;
  let totalCost = 0;
  for (const ability of abilities) {
    const value = stats[ability];
    if (value < config.statMin || value > config.statMax) {
      throw new AllocationValidationError(
        "stat_range",
        `Stat ${ability}=${value} outside world range [${config.statMin}, ${config.statMax}]`,
      );
    }

    const cost = POINT_BUY_COST[value];
    if (cost === undefined) {
      throw new AllocationValidationError("budget", `Stat ${ability}=${value} has no point-buy cost`,);
    }

    totalCost += cost;
  }

  if (totalCost > config.statPointBudget) {
    throw new AllocationValidationError(
      "budget",
      `Point-buy cost ${totalCost} exceeds budget ${config.statPointBudget}`,
    );
  }

  let traits;
  try {
    traits = assertTraitIds(traitIds,);
  } catch {
    throw new AllocationValidationError("unknown_trait", "Unknown trait id in assignment",);
  }

  const allowed = new Set(getTraitsForWorld(worldId,).map((trait,) => trait.id),);
  for (const trait of traits) {
    if (!allowed.has(trait.id,)) {
      throw new AllocationValidationError("trait_scope", `Trait ${trait.id} not available in world ${worldId}`,);
    }
  }
}

/**
 * Read an actor's allocation (null when absent).
 * @param deps
 * @param actorId
 * @returns {Promise<StatAllocation | null>}
 */
export async function getStatAllocation(
  deps: RpgServiceDeps,
  actorId: string,
): Promise<StatAllocation | null> {
  const row = await deps.database
    .selectFrom("character_stat_allocation",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const assignments = await deps.database
    .selectFrom("character_trait_assignments",)
    .select("trait_id",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", row.world_id,)
    .execute();

  return {
    actorId: row.actor_id,
    worldId: row.world_id,
    stats: {
      str: row.allocated_str,
      dex: row.allocated_dex,
      con: row.allocated_con,
      int: row.allocated_int,
      wis: row.allocated_wis,
      cha: row.allocated_cha,
    },
    traitIds: assignments.map((assignment,) => assignment.trait_id),
    allocatedAt: row.allocated_at,
    allocatedByUserId: row.allocated_by_user_id,
  };
}

/**
 * Upsert an actor's allocation after validation.
 * @param deps
 * @param actorId
 * @param worldId
 * @param stats
 * @param traitIds
 * @param grantedByUserId
 * @throws AllocationValidationError
 * @returns {Promise<StatAllocation>}
 */
export async function putStatAllocation(
  deps: RpgServiceDeps,
  actorId: string,
  worldId: string,
  stats: StatBlock,
  traitIds: readonly string[],
  grantedByUserId: string | null,
): Promise<StatAllocation> {
  await validateAllocation(deps, worldId, stats, traitIds,);
  const now = new Date().toISOString();

  await deps.database.transaction().execute(async (transaction,) => {
    await transaction
      .insertInto("character_stat_allocation",)
      .values({
        actor_id: actorId,
        world_id: worldId,
        allocated_str: stats.str,
        allocated_dex: stats.dex,
        allocated_con: stats.con,
        allocated_int: stats.int,
        allocated_wis: stats.wis,
        allocated_cha: stats.cha,
        allocated_at: now,
        allocated_by_user_id: grantedByUserId,
      },)
      .onConflict((conflict,) =>
        conflict.column("actor_id",).doUpdateSet({
          world_id: worldId,
          allocated_str: stats.str,
          allocated_dex: stats.dex,
          allocated_con: stats.con,
          allocated_int: stats.int,
          allocated_wis: stats.wis,
          allocated_cha: stats.cha,
          allocated_at: now,
          allocated_by_user_id: grantedByUserId,
        },)
      )
      .execute();

    await transaction.deleteFrom("character_trait_assignments",).where("actor_id", "=", actorId,).execute();
    for (const traitId of traitIds) {
      await transaction
        .insertInto("character_trait_assignments",)
        .values({
          actor_id: actorId,
          trait_id: traitId,
          world_id: worldId,
          granted_at: now,
          granted_by_user_id: grantedByUserId,
        },)
        .execute();
    }
  },);

  const allocation = await getStatAllocation(deps, actorId,);
  if (allocation === null) {
    throw new Error(`Allocation write failed for actor ${actorId}`,);
  }

  return allocation;
}
