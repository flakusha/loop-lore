// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 279

import type { Kysely, } from "kysely";
import type {
  ContentIntensity,
  FantasyCategory,
} from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { MoodService, } from "../../../characters/services/mood-service";
import { IntimacyService, } from "../../intimacy/service";
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
 * @param db
 * @param opts
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
 * @param db
 * @param actorId
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
 * @param db
 * @param actorId
 * @param category
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
 * Fulfill a fantasy for a target: applies the stored fulfillment
 * effects (intimacy bonus via the canonical pair path, mood bonus via
 * one source-tagged event) and counts the exploration. Returns the
 * fulfillment effects so encounter narration can consume them.
 *
 * Disclosure stays per-actor: fantasies are keyed on the owning actor
 * (actor_id), never global — `forTarget` only scopes the effect legs.
 * Extreme intensities (intense/extreme) emit a content-warning log
 * before fulfillment; the fulfillment still proceeds (warning, not
 * filter — Open Q5).
 * @param db
 * @param fantasyId
 * @param forTarget
 */
export async function fulfillFantasy(
  db: Kysely<DB>,
  fantasyId: string,
  forTarget?: { actorId: string; worldId?: string | null },
): Promise<FulfillmentEffects | null> {
  const row = await db
    .selectFrom("character_fantasies",)
    .where("id", "=", fantasyId,)
    .selectAll()
    .executeTakeFirst();
  if (!row) { return null; }
  const log = getLogger().child({ module: "fantasies", },);
  const fantasy = getRow(row as any,);
  if (fantasy.intensity === "intense" || fantasy.intensity === "extreme") {
    log.warn(`nsfw.content_warning: fulfilling ${fantasy.intensity} fantasy "${fantasy.name}" (${fantasy.category})`,);
  }
  const target = forTarget?.actorId ?? fantasy.actorId;
  const effects = fantasy.fulfillmentEffects;
  await applyFulfillIntimacy(db, log, fantasy, forTarget, effects,);
  await applyFulfillMood(db, log, fantasy, forTarget, target, effects,);
  await recordExploration(db, fantasyId,);
  return effects;
}

/**
 * Intimacy leg of fulfillment: pair bonus toward the owning actor.
 * Skipped when the target IS the owner (no self-pair) or the bonus
 * is zero. Best-effort: failures only warn.
 * @param db
 * @param log
 * @param fantasy
 * @param forTarget
 * @param effects
 */
async function applyFulfillIntimacy(
  db: Kysely<DB>,
  log: ReturnType<typeof getLogger>,
  fantasy: Fantasy,
  forTarget: { actorId: string; worldId?: string | null } | undefined,
  effects: FulfillmentEffects,
): Promise<void> {
  const target = forTarget?.actorId ?? fantasy.actorId;
  if (effects.intimacyBonus === 0 || target === fantasy.actorId) { return; }
  try {
    const intimacy = new IntimacyService(db,);
    await intimacy.applyAction({
      database: db,
      actorId: target,
      targetActorId: fantasy.actorId,
      worldId: forTarget?.worldId ?? null,
      action: {
        id: `fantasy:${fantasy.id}`,
        name: `Fantasy fulfilled: ${fantasy.name}`,
        type: "intimate",
        delta: effects.intimacyBonus,
        minIntimacy: 0,
        requiresConsent: false,
      },
    },);
  } catch (cause) {
    log.warn(`Fantasy intimacy leg skipped for ${target}:`, cause instanceof Error ? cause : undefined,);
  }
}

/**
 * Mood leg of fulfillment: one source-tagged `fantasy.fulfilled`
 * event on the target. Best-effort: failures only warn.
 * @param db
 * @param log
 * @param fantasy
 * @param forTarget
 * @param target
 * @param effects
 */
async function applyFulfillMood(
  db: Kysely<DB>,
  log: ReturnType<typeof getLogger>,
  fantasy: Fantasy,
  forTarget: { actorId: string; worldId?: string | null } | undefined,
  target: string,
  effects: FulfillmentEffects,
): Promise<void> {
  if (effects.moodBonus === 0) { return; }
  try {
    const mood = MoodService(db,);
    await mood.logEvent({
      actorId: target,
      worldId: forTarget?.worldId ?? undefined,
      eventType: "fantasy.fulfilled",
      happinessDelta: effects.moodBonus,
      source: "fantasy",
      sourceId: `${fantasy.id}:${fantasy.category}`,
    },);
  } catch (cause) {
    log.warn(`Fantasy mood leg skipped for ${target}:`, cause instanceof Error ? cause : undefined,);
  }
}

/**
 * Record exploration of a fantasy (after encounter).
 * @param db
 * @param fantasyId
 * @param feeling
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
 * @param db
 * @param fantasyId
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

/**
 * Convert a database row to a Fantasy object.
 * @param row
 * @param row.id
 * @param row.actor_id
 * @param row.fantasy_name
 * @param row.category
 * @param row.intensity
 * @param row.requirements
 * @param row.fulfillment_effects
 * @param row.risks
 * @param row.discovered_through
 * @param row.initial_reaction
 * @param row.current_feeling
 * @param row.times_explored
 * @param row.created_at
 * @param row.updated_at
 */
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
