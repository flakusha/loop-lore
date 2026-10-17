// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/anomalies.ts — the location-anomaly engine (migration 059)
 *
 * An anomaly is a stored overlay on ONE location: it carries stat deltas,
 * damage/healing per second, and two yield multipliers until it expires.
 * Nothing here interprets those effects — `applyAnomalyModifiers` in
 * ./anomaly-modifiers folds them into a record a caller consumes, and
 * `getAnomalyForPrompt` renders the GM-facing line.
 *
 * Discovery is a DETERMINISTIC seeded roll, not a coin flip. `hashSeed`/
 * `mulberry32` come from ./autonomy/rng.ts — the same derivation the world
 * scheduler uses — so folding the anomaly id into the seed means the same
 * (seed, anomaly) pair always resolves the same way and a test can assert
 * an exact outcome rather than a probability band.
 *
 * Expiry is by DELETION, not a soft flag: a permanent anomaly has
 * `expires_at IS NULL` and therefore can never match the sweep predicate,
 * so one query removes exactly the rows that ran out.
 */
import type { Kysely, } from "kysely";
import { hashSeed, mulberry32, } from "../autonomy/rng";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonStringifyOr, } from "../utils";
import { toDate, } from "../utils/date";
import { type Anomaly, PERMANENT_DURATION_SECONDS, type PlaceAnomalyInput, } from "./anomaly-types";
import { findWorld, } from "./lookup";

/** Raised for unknown worlds/locations and invalid anomaly inputs. */
export class AnomalyError extends Error {
  override readonly name = "AnomalyError";
}

/** Result of one discovery attempt. */
export interface DiscoveryResult {
  /** True when the roll beat `discovery_chance` and the row was stamped. */
  discovered: boolean;
  /** The anomaly after the attempt, whether or not it was found. */
  anomaly: Anomaly;
}

/**
 * Place a new anomaly on a location.
 *
 * `durationSeconds` decides the expiry stamp: -1 (the default) leaves
 * `expires_at` NULL, anything else stamps `now + duration`. The anomaly
 * starts undiscovered — `discoverAnomaly` is the only writer of
 * `discovered_at`.
 * @param db Kysely handle
 * @param worldId world that owns the location
 * @param locationId location the anomaly attaches to
 * @param input anomaly fields; see {@link PlaceAnomalyInput}
 * @param now instant the placement is stamped with
 * @returns the persisted row
 * @throws {AnomalyError} when the world or location does not exist, the
 *   name is blank, or `discoveryChance` is outside 0..1.
 */
export async function placeAnomaly(
  { db, worldId, locationId, input, now, }: {
    db: Kysely<DB>;
    worldId: string;
    locationId: string;
    input: PlaceAnomalyInput;
    now: Date;
  },
): Promise<Anomaly> {
  const name = input.name.trim();
  if (name.length === 0) { throw new AnomalyError("anomaly name must be a non-empty string",); }

  if (
    input.discoveryChance !== undefined &&
    (input.discoveryChance < 0 || input.discoveryChance > 1)
  ) {
    throw new AnomalyError("discoveryChance must be between 0 and 1",);
  }

  const world = await findWorld(db, worldId,);
  if (world === undefined) { throw new AnomalyError(`world "${worldId}" does not exist`,); }

  const location = await db
    .selectFrom("locations",)
    .select("world_id",)
    .where("id", "=", locationId,)
    .executeTakeFirst();

  if (location === undefined) { throw new AnomalyError(`location "${locationId}" does not exist`,); }
  if (location.world_id !== worldId) {
    throw new AnomalyError(`location "${locationId}" does not belong to world "${worldId}"`,);
  }

  const duration = input.durationSeconds ?? PERMANENT_DURATION_SECONDS;
  const stamp = now.toISOString();
  const row = {
    location_id: locationId,
    world_id: worldId,
    name,
    type: input.type,
    stat_modifiers: jsonStringifyOr(input.statModifiers ?? {},),
    damage_over_time: input.damageOverTime ?? 0,
    healing_over_time: input.healingOverTime ?? 0,
    experience_multiplier: input.experienceMultiplier ?? 1,
    loot_multiplier: input.lootMultiplier ?? 1,
    special_effects: jsonStringifyOr(input.specialEffects ?? [], "[]",),
    duration_seconds: duration,
    discovery_chance: input.discoveryChance ?? 0,
    discovered_at: null,
    interaction_required: input.interactionRequired ?? "optional",
    expires_at: duration === PERMANENT_DURATION_SECONDS ? null : toDate(now.getTime() + duration * 1000,)
      .toISOString(),
    created_at: stamp,
  };

  // `RETURNING id` rather than reading `insertedId`: the PK is a TEXT hex
  // default, not a rowid, so the driver's lastInsertRowid is unrelated.
  const inserted = await db
    .insertInto("location_anomalies",)
    .values(row,)
    .returning("id",)
    .executeTakeFirstOrThrow();

  getLogger().debug("placed anomaly", { anomalyId: inserted.id, locationId, worldId, },);

  return { ...inserted, ...row, };
}

/**
 * List the anomalies attached to a location.
 * @param db Kysely handle
 * @param worldId world the anomalies must belong to
 * @param locationId location to read
 * @returns rows in creation order
 * @throws {AnomalyError} never — an empty result is a normal outcome.
 */
export function listAnomalies(
  { db, worldId, locationId, }: { db: Kysely<DB>; worldId: string; locationId: string },
): Promise<Anomaly[]> {
  return db
    .selectFrom("location_anomalies",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("location_id", "=", locationId,)
    .orderBy("created_at", "asc",)
    .execute();
}

/**
 * Roll for one anomaly's discovery.
 *
 * The roll is `mulberry32(hashSeed(seed, anomalyId))()` compared against
 * `discovery_chance`, so the outcome is a pure function of the seed and
 * the anomaly — no hidden state, no shared stream to perturb.
 * @param db Kysely handle
 * @param worldId world the anomaly must belong to
 * @param anomalyId anomaly to roll for
 * @param seed deterministic seed for this attempt
 * @param now instant stamped on a successful discovery
 * @returns whether the roll succeeded, plus the row in its new state
 * @throws {AnomalyError} when no anomaly with that id exists in this world.
 */
export async function discoverAnomaly(
  { db, worldId, anomalyId, seed, now, }: {
    db: Kysely<DB>;
    worldId: string;
    anomalyId: string;
    seed: number;
    now: Date;
  },
): Promise<DiscoveryResult> {
  const anomaly = await db
    .selectFrom("location_anomalies",)
    .selectAll()
    .where("id", "=", anomalyId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();

  if (anomaly === undefined) { throw new AnomalyError(`anomaly "${anomalyId}" does not exist`,); }

  const roll = mulberry32(hashSeed(seed, anomalyId,),);
  if (roll() >= anomaly.discovery_chance) { return { discovered: false, anomaly, }; }

  const stamp = now.toISOString();
  await db
    .updateTable("location_anomalies",)
    .set({ discovered_at: stamp, },)
    .where("id", "=", anomalyId,)
    .where("world_id", "=", worldId,)
    .execute();

  return { discovered: true, anomaly: { ...anomaly, discovered_at: stamp, }, };
}

/**
 * Delete every anomaly whose lifetime has run out.
 *
 * Permanent anomalies store `expires_at = NULL`, and `expires_at <= ?`
 * is false for NULL in SQL, so they are structurally unreachable here.
 * @param db Kysely handle
 * @param now instant the sweep compares against
 * @param worldId optional world to scope the sweep to
 * @returns how many rows were removed
 * @throws never
 */
export async function expireAnomalies(
  { db, now, worldId, }: { db: Kysely<DB>; now: Date; worldId?: string },
): Promise<number> {
  const stamp = now.toISOString();
  let expired = db
    .deleteFrom("location_anomalies",)
    .where("expires_at", "is not", null,)
    .where("expires_at", "<=", stamp,);

  if (worldId !== undefined) { expired = expired.where("world_id", "=", worldId,); }

  const result = await expired.executeTakeFirst();
  const removed = Number(result?.numDeletedRows ?? 0,);
  if (removed > 0) { getLogger().debug("swept expired anomalies", { removed, },); }
  return removed;
}
