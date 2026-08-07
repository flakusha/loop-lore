import type { Kysely, } from "kysely";
import type { HeatPhase, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { jsonParseOr, jsonStringifyOr, uid, } from "../../../utils";
import type { HeatCycleState, HeatEffects, } from "./types";

/** Convert database row to HeatCycleState object */
export function rowToHeatCycle(row: {
  id: string;
  actor_id: string;
  species: string;
  cycle_length_days: number;
  current_phase: HeatPhase;
  days_until_next_heat: number;
  effects: string;
  created_at: string;
  updated_at: string;
},): HeatCycleState {
  return {
    id: row.id,
    actorId: row.actor_id,
    species: row.species,
    cycleLengthDays: row.cycle_length_days,
    currentPhase: row.current_phase,
    daysUntilNextHeat: row.days_until_next_heat,
    effects: jsonParseOr<HeatEffects>(row.effects, {} as HeatEffects,),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get or create a heat cycle for an actor.
 */
export async function getHeatCycle(
  db: Kysely<DB>,
  actorId: string,
  species = "human",
): Promise<HeatCycleState> {
  const row = await db
    .selectFrom("character_heat_cycle",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .executeTakeFirst();

  if (row) {
    return rowToHeatCycle(row as any,);
  }

  // Create default cycle (no heat for humans)
  const now = new Date().toISOString();
  const id = uid();
  const isHuman = species.toLowerCase() === "human";

  const defaultEffects: HeatEffects = {
    arousalMultiplier: 1,
    seductionResistance: 1,
    pheromoneEmission: 0,
    fertilityBoost: 1,
    moodInstability: 0,
    desireIntensity: 1,
  };

  await db
    .insertInto("character_heat_cycle",)
    .values({
      id,
      actor_id: actorId,
      species,
      cycle_length_days: isHuman ? 0 : 30,
      current_phase: "normal",
      days_until_next_heat: isHuman ? 0 : 30,
      effects: jsonStringifyOr(defaultEffects,),
      created_at: now,
      updated_at: now,
    },)
    .execute();

  return {
    id,
    actorId,
    species,
    cycleLengthDays: isHuman ? 0 : 30,
    currentPhase: "normal",
    daysUntilNextHeat: isHuman ? 0 : 30,
    effects: defaultEffects,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Advance the heat cycle by a number of days.
 */
export async function advanceHeatCycle(
  db: Kysely<DB>,
  actorId: string,
  days: number,
): Promise<{ newPhase: HeatPhase; daysUntilNext: number }> {
  const cycle = await getHeatCycle(db, actorId,);
  if (cycle.cycleLengthDays === 0) {
    return { newPhase: "normal", daysUntilNext: 0, };
  }

  let remaining = cycle.daysUntilNextHeat - days;
  let newPhase = cycle.currentPhase;

  // Phase transitions
  if (remaining <= 0) {
    // Cycle completes — advance phase
    const phaseOrder: HeatPhase[] = ["normal", "pre_heat", "heat", "post_heat",];
    const currentIdx = phaseOrder.indexOf(cycle.currentPhase,);
    const nextIdx = (currentIdx + 1) % phaseOrder.length;
    newPhase = phaseOrder[nextIdx]!;

    // Reset remaining days for new phase
    remaining = newPhase === "heat"
      ? Math.floor(cycle.cycleLengthDays * 0.25,)
      : Math.floor(cycle.cycleLengthDays * 0.25,);
  }

  const now = new Date().toISOString();
  await db
    .updateTable("character_heat_cycle",)
    .set({
      current_phase: newPhase,
      days_until_next_heat: Math.max(0, remaining,),
      updated_at: now,
    },)
    .where("actor_id", "=", actorId,)
    .execute();

  const log = getLogger().child({ module: "body-systems", },);
  log.info(`Heat cycle ${actorId}: ${cycle.currentPhase}→${newPhase} (${days} days)`,);

  return { newPhase, daysUntilNext: Math.max(0, remaining,), };
}

/**
 * Get the current heat effects for an actor.
 * Returns nullified effects for non-heat species.
 */
export async function getHeatEffects(
  db: Kysely<DB>,
  actorId: string,
): Promise<HeatEffects> {
  const cycle = await getHeatCycle(db, actorId,);
  if (cycle.currentPhase !== "heat") {
    return {
      arousalMultiplier: 1,
      seductionResistance: 1,
      pheromoneEmission: 0,
      fertilityBoost: 1,
      moodInstability: 0,
      desireIntensity: 1,
    };
  }
  return cycle.effects;
}
