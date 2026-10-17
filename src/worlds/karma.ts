// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/karma.ts — actor karma and per-faction standing
 * (migration 062).
 *
 * `karma_profiles` is the running total plus a per-category breakdown;
 * `karma_events` is the append-only ledger that explains it.
 * `faction_standing` is the same -100..100 convention applied to one
 * actor and ONE faction — distinct from the faction-to-faction score in
 * `faction_relationships`.
 *
 * This is world karma, NOT `src/rpg/reputation.ts`: that module is
 * character-scoped and NSFW-gated and is left untouched.
 */
import type { Kysely, } from "kysely";
import type { KarmaCategory, } from "../db/enums-story";
import type { DB, } from "../db/schema";
import { jsonParseOr, jsonStringifyOr, uid, } from "../utils";
import { FactionError, } from "./factions";
import type { KarmaTier, StandingTier, } from "./karma-tiers";
import { clampScore, computeKarmaTier, computeStandingTier, } from "./karma-tiers";

/** An actor's karma, decoded from `karma_profiles`. */
export interface KarmaProfile {
  actor_id: string;
  world_id: string;
  overall: number;
  categories: Record<string, number>;
  tier: KarmaTier;
}

/** One actor's standing with one faction, decoded from `faction_standing`. */
export interface ActorFactionStanding {
  actor_id: string;
  world_id: string;
  faction_id: string;
  standing: number;
  tier: StandingTier;
}

/**
 * Read an actor's karma, creating the zeroed profile row on first use.
 * @param db Kysely handle
 * @param worldId world the karma belongs to
 * @param actorId karma owner
 * @returns the profile with its karma tier
 * @throws {FactionError} not-found when the world does not exist
 */
export async function getKarma(
  db: Kysely<DB>,
  worldId: string,
  actorId: string,
): Promise<KarmaProfile> {
  const row = await ensureProfile(db, worldId, actorId,);

  return {
    actor_id: row.actor_id,
    world_id: row.world_id,
    overall: row.overall,
    categories: jsonParseOr<Record<string, number>>(row.categories_json, {},),
    tier: computeKarmaTier({ overall: row.overall, },),
  };
}

/** Options for `recordKarmaEvent`. */
export interface RecordKarmaEventOptions {
  db: Kysely<DB>;
  worldId: string;
  actorId: string;
  category: KarmaCategory;
  /** Score change; added to `overall` and to the named category. */
  delta: number;
  reason?: string;
  now?: Date;
}

/**
 * Append one karma event and fold it into `overall` and its category.
 * @param options the event to record
 * @returns the profile after the event was applied
 */
export async function recordKarmaEvent(options: RecordKarmaEventOptions,): Promise<KarmaProfile> {
  const stamp = (options.now ?? new Date()).toISOString();
  const row = await ensureProfile(options.db, options.worldId, options.actorId,);
  const categories = jsonParseOr<Record<string, number>>(row.categories_json, {},);
  const overall = clampScore(row.overall + options.delta,);
  categories[options.category] = clampScore((categories[options.category] ?? 0) + options.delta,);

  await options.db
    .updateTable("karma_profiles",)
    .set({ overall, categories_json: jsonStringifyOr(categories,), updated_at: stamp, },)
    .where("id", "=", row.id,)
    .execute();

  await options.db
    .insertInto("karma_events",)
    .values({
      id: uid(),
      world_id: options.worldId,
      actor_id: options.actorId,
      category: options.category,
      delta: options.delta,
      reason: options.reason ?? "",
      occurred_at: stamp,
    },)
    .execute();

  return getKarma(options.db, options.worldId, options.actorId,);
}

/** Options for `getFactionStanding`. */
export interface FactionStandingQuery {
  db: Kysely<DB>;
  worldId: string;
  actorId: string;
  factionId: string;
}

/**
 * Read one actor's standing with one faction. An actor nobody has a
 * record with is neutral, not an error — that is what gates a
 * free-jump price tag before the first quest is run.
 * @param query world, actor, and faction
 * @returns the standing and its tier
 */
export async function getFactionStanding(query: FactionStandingQuery,): Promise<ActorFactionStanding> {
  const row = await query.db
    .selectFrom("faction_standing",)
    .select(["standing",],)
    .where("world_id", "=", query.worldId,)
    .where("faction_id", "=", query.factionId,)
    .where("actor_id", "=", query.actorId,)
    .executeTakeFirst();

  const standing = row?.standing ?? 0;

  return {
    actor_id: query.actorId,
    world_id: query.worldId,
    faction_id: query.factionId,
    standing,
    tier: computeStandingTier({ standing, },),
  };
}

/** Options for `adjustFactionStanding`. */
export interface AdjustFactionStandingOptions extends FactionStandingQuery {
  /** Score change; clamped so the result stays within -100..100. */
  delta: number;
  reason?: string;
  now?: Date;
}

/**
 * Move an actor's standing with a faction, creating the row on first use.
 * @param options the standing change to apply
 * @returns the standing and tier after the change
 */
export async function adjustFactionStanding(
  options: AdjustFactionStandingOptions,
): Promise<ActorFactionStanding> {
  const stamp = (options.now ?? new Date()).toISOString();
  const current = await getFactionStanding(options,);
  const standing = clampScore(current.standing + options.delta,);

  await options.db
    .insertInto("faction_standing",)
    .values({
      id: uid(),
      world_id: options.worldId,
      faction_id: options.factionId,
      actor_id: options.actorId,
      standing,
      quests_completed: 0,
      quests_failed: 0,
      items_traded: 0,
      enemies_killed: 0,
      updated_at: stamp,
    },)
    .onConflict((oc,) =>
      oc.columns(["world_id", "faction_id", "actor_id",],).doUpdateSet({ standing, updated_at: stamp, },)
    )
    .execute();

  return getFactionStanding(options,);
}

/** A `karma_profiles` row as stored. */
interface StoredKarmaProfile {
  id: string;
  world_id: string;
  actor_id: string;
  overall: number;
  categories_json: string;
}

/**
 * Fetch the profile row, inserting a zeroed one on first use.
 * @param db Kysely handle
 * @param worldId world the karma belongs to
 * @param actorId karma owner
 * @returns the stored profile row
 * @throws {FactionError} not-found when the world does not exist
 */
async function ensureProfile(
  db: Kysely<DB>,
  worldId: string,
  actorId: string,
): Promise<StoredKarmaProfile> {
  const existing = await db
    .selectFrom("karma_profiles",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  if (existing) { return existing; }

  const world = await db.selectFrom("worlds",).select("id",).where("id", "=", worldId,).executeTakeFirst();
  if (!world) { throw new FactionError("not-found", `world ${worldId} does not exist`,); }

  const id = uid();
  await db
    .insertInto("karma_profiles",)
    .values({
      id,
      world_id: worldId,
      actor_id: actorId,
      overall: 0,
      categories_json: "{}",
      updated_at: new Date().toISOString(),
    },)
    .execute();

  const created = await db
    .selectFrom("karma_profiles",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirstOrThrow();

  return created;
}
