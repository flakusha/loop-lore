// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type {
  ContentIntensity,
  FantasyCategory,
} from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { jsonStringifyOr, } from "../../../utils";
import { nowAndId, parseJsonField, } from "../../shared/rpg-service-utils";
import type {
  CreateFantasyOpts,
  Fantasy,
  FantasyRequirements,
  FantasyRisks,
  FulfillmentEffects,
} from "./types";

/**
 * Create a fantasy for an actor.
 */
export async function createFantasy(
  db: Kysely<DB>,
  opts: CreateFantasyOpts,
): Promise<Fantasy> {
  const {
    actorId,
    name,
    category,
    intensity,
    requirements,
    fulfillmentEffects,
    risks,
    discoveredThrough,
    initialReaction,
  } = opts;

  const { id, now, } = nowAndId();

  const defaultRequirements: FantasyRequirements = {
    partnerType: [],
    locationType: [],
    equipment: [],
    minIntimacy: 0,
    minArousal: 0,
  };

  const defaultEffects: FulfillmentEffects = {
    satisfactionBonus: 10,
    intimacyBonus: 3,
    moodBonus: 5,
    memoryStrength: 50,
    repeatDesire: 50,
  };

  const defaultRisks: FantasyRisks = {
    reputationRisk: 0,
    emotionalRisk: 0,
    physicalRisk: 0,
    discoveryRisk: 0,
  };

  await db
    .insertInto("character_fantasies",)
    .values({
      id,
      actor_id: actorId,
      fantasy_name: name,
      category,
      intensity: intensity ?? "mild",
      requirements: jsonStringifyOr({ ...defaultRequirements, ...requirements, },),
      fulfillment_effects: jsonStringifyOr({ ...defaultEffects, ...fulfillmentEffects, },),
      risks: jsonStringifyOr({ ...defaultRisks, ...risks, },),
      discovered_through: discoveredThrough ?? null,
      initial_reaction: initialReaction ?? "neutral",
      current_feeling: initialReaction ?? "neutral",
      times_explored: 0,
      created_at: now,
      updated_at: now,
    },)
    .execute();

  const log = getLogger().child({ module: "fantasies", },);
  log.info(`Fantasy created: ${name} (${category}) for ${actorId}`,);

  return {
    id,
    actorId,
    name,
    category,
    intensity: intensity ?? "mild",
    requirements: { ...defaultRequirements, ...requirements, },
    fulfillmentEffects: { ...defaultEffects, ...fulfillmentEffects, },
    risks: { ...defaultRisks, ...risks, },
    discoveredThrough: discoveredThrough ?? null,
    initialReaction: initialReaction ?? "neutral",
    currentFeeling: initialReaction ?? "neutral",
    timesExplored: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get all fantasies for an actor.
 */
export async function getActorFantasies(
  db: Kysely<DB>,
  actorId: string,
): Promise<Fantasy[]> {
  const rows = await db
    .selectFrom("character_fantasies",)
    .where("actor_id", "=", actorId,)
    .orderBy("category", "asc",)
    .orderBy("fantasy_name", "asc",)
    .selectAll()
    .execute();

  return Array.from(rows, (r,) => getRow(r as any,),);
}

/**
 * Get fantasies by category.
 */
export async function getByCategory(
  db: Kysely<DB>,
  actorId: string,
  category: FantasyCategory,
): Promise<Fantasy[]> {
  const rows = await db
    .selectFrom("character_fantasies",)
    .where("actor_id", "=", actorId,)
    .where("category", "=", category,)
    .orderBy("intensity", "asc",)
    .selectAll()
    .execute();

  return Array.from(rows, (r,) => getRow(r as any,),);
}

/**
 * Record exploration of a fantasy (after encounter).
 */
export async function recordExploration(
  db: Kysely<DB>,
  fantasyId: string,
  feeling?: string,
): Promise<boolean> {
  // Fetch current value first
  const current = await db
    .selectFrom("character_fantasies",)
    .select("times_explored",)
    .where("id", "=", fantasyId,)
    .executeTakeFirst();

  if (!current) { return false; }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    times_explored: current.times_explored + 1,
    updated_at: now,
  };

  if (feeling) {
    updates.current_feeling = feeling;
  }

  const result = await db
    .updateTable("character_fantasies",)
    .set(updates,)
    .where("id", "=", fantasyId,)
    .executeTakeFirst();

  return (result.numUpdatedRows ?? 0n) > 0n;
}

/**
 * Delete a fantasy.
 */
export async function deleteFantasy(
  db: Kysely<DB>,
  fantasyId: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom("character_fantasies",)
    .where("id", "=", fantasyId,)
    .executeTakeFirst();

  return (result.numDeletedRows ?? 0n) > 0n;
}

/** Convert a database row to a Fantasy object. */
function getRow(row: {
  id: string;
  actor_id: string;
  fantasy_name: string;
  category: FantasyCategory;
  intensity: ContentIntensity;
  requirements: string;
  fulfillment_effects: string;
  risks: string;
  discovered_through: string | null;
  initial_reaction: string;
  current_feeling: string;
  times_explored: number;
  created_at: string;
  updated_at: string;
},): Fantasy {
  return {
    id: row.id,
    actorId: row.actor_id,
    name: row.fantasy_name,
    category: row.category,
    intensity: row.intensity,
    requirements: parseJsonField<FantasyRequirements>(row.requirements, {
      partnerType: [],
      locationType: [],
      equipment: [],
      minIntimacy: 0,
      minArousal: 0,
    },),
    fulfillmentEffects: parseJsonField<FulfillmentEffects>(row.fulfillment_effects, {
      satisfactionBonus: 10,
      intimacyBonus: 3,
      moodBonus: 5,
      memoryStrength: 50,
      repeatDesire: 50,
    },),
    risks: parseJsonField<FantasyRisks>(row.risks, {
      reputationRisk: 0,
      emotionalRisk: 0,
      physicalRisk: 0,
      discoveryRisk: 0,
    },),
    discoveredThrough: row.discovered_through,
    initialReaction: row.initial_reaction,
    currentFeeling: row.current_feeling,
    timesExplored: row.times_explored,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
