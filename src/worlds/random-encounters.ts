// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/random-encounters.ts — the generic encounter engine (migration 059)
 *
 * NOT the NSFW encounter CRUD in ./rpg/encounters — different tables
 * (`nsfw_encounters`), different consumers. This module rolls the generic
 * `encounter_templates` pool and records what fired in `encounter_rolls`.
 *
 * ORDER OF OPERATIONS, and why:
 *   1. world exists        — a bad world id is a caller bug, not a miss
 *   2. candidate selection — enabled, right trigger_type, right travel
 *                           phase, and world-scoped OR global
 *   3. cooldown filter     — a template whose newest roll carries
 *                           `cooldown_until > now` is out, BEFORE the
 *                           draw, so a re-roll cannot reselect it
 *   4. pick                — one seeded draw, `mulberry32(hashSeed(...))`
 *   5. chance gate         — the drawn template's own `trigger_chance`
 *   6. record              — the roll row is the cooldown cursor
 *
 * Steps 4 and 5 share ONE rng stream on purpose: the pick consumes the
 * first draw and the chance gate the second, so the same seed reproduces
 * the same pair of draws and a test can assert an exact template id.
 *
 * GLOBAL TEMPLATES. `world_id IS NULL` rows are in every world's pool.
 * They are read-only by construction here — nothing in this module writes
 * a template — so no caller can mutate another world's table by rolling.
 */
import type { Kysely, } from "kysely";
import { hashSeed, mulberry32, } from "../autonomy/rng";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonStringifyOr, } from "../utils";
import { toDate, } from "../utils/date";
import {
  type EncounterTemplate,
  ROLL_REASONS,
  type RollEncounterInput,
  type RollEncounterResult,
} from "./encounter-types";
import { findWorld, } from "./lookup";

/** Difficulty jitter applied to the template's base, clamped to 0..100. */
const DIFFICULTY_JITTER = 10;

/** Raised for unknown worlds and unknown roll ids. */
export class EncounterError extends Error {
  override readonly name = "EncounterError";
}

/**
 * Attempt to fire one encounter.
 *
 * Never throws for a legitimate miss: an empty pool, a cooling-down pool
 * and a lost chance roll all come back as `{ triggered: false, reason }`
 * so a caller can log the difference without a try/catch.
 * @param db Kysely handle
 * @param input world/location/trigger/seed/now; see {@link RollEncounterInput}
 * @returns the fired template and its roll row, or the reason nothing fired
 * @throws {EncounterError} when the world does not exist.
 */
export async function rollEncounter(
  { db, input, }: { db: Kysely<DB>; input: RollEncounterInput },
): Promise<RollEncounterResult> {
  const { worldId, locationId, triggerType, travelPhase, rngSeed, now, } = input;

  const world = await findWorld(db, worldId,);
  if (world === undefined) {
    throw new EncounterError(`world "${worldId}" does not exist`,);
  }

  let candidates = db
    .selectFrom("encounter_templates",)
    .selectAll()
    .where("active", "=", "enabled",)
    .where("trigger_type", "=", triggerType,)
    .where((eb,) => eb.or([eb("world_id", "is", null,), eb("world_id", "=", worldId,),],));

  if (travelPhase !== undefined) {
    candidates = candidates.where((eb,) =>
      eb.or([eb("travel_phase", "is", null,), eb("travel_phase", "=", travelPhase,),],)
    );
  }

  const pool = await candidates.orderBy("id", "asc",).execute();
  if (pool.length === 0) { return { triggered: false, reason: ROLL_REASONS.NoCandidates, }; }

  const stamp = now.toISOString();
  const cooling = await db
    .selectFrom("encounter_rolls",)
    .select("template_id",)
    .select((eb,) => eb.fn.max("rolled_at",).as("last_rolled",))
    .where("world_id", "=", worldId,)
    .groupBy("template_id",)
    .execute();

  const lastRolledAt = new Map(cooling.map((row,) => [row.template_id, row.last_rolled,]),);

  // A template is eligible when it has never fired, or fired with no
  // cooldown, or fired long enough ago that the window has closed.
  const eligible = pool.filter((template,) => {
    const previous = lastRolledAt.get(template.id,);
    if (previous === null || previous === undefined) { return true; }
    return now.getTime() - toDate(previous,).getTime() >= template.cooldown_seconds * 1000;
  },);

  if (eligible.length === 0) { return { triggered: false, reason: ROLL_REASONS.AllOnCooldown, }; }

  const rng = mulberry32(hashSeed(rngSeed, worldId, triggerType, locationId ?? "",),);
  const drawn = eligible[Math.floor(rng() * eligible.length,) % eligible.length] as EncounterTemplate;

  const jitter = Math.floor(rng() * (DIFFICULTY_JITTER * 2 + 1),) - DIFFICULTY_JITTER;
  const difficulty = Math.max(0, Math.min(100, drawn.difficulty + jitter,),);

  // Charge the chance gate BEFORE writing the roll row. A miss must not
  // advance any cooldown, or a template with trigger_chance 0 would still
  // lock itself out of the pool after a single attempt.
  if (rng() >= drawn.trigger_chance) {
    return { triggered: false, reason: ROLL_REASONS.ChanceMissed, };
  }

  const roll = await db
    .insertInto("encounter_rolls",)
    .values({
      world_id: worldId,
      location_id: locationId ?? null,
      template_id: drawn.id,
      rolled_at: stamp,
      difficulty_rolled: difficulty,
      cooldown_until: drawn.cooldown_seconds > 0
        ? toDate(now.getTime() + drawn.cooldown_seconds * 1000,).toISOString()
        : null,
    },)
    .returning("id",)
    .executeTakeFirstOrThrow();

  getLogger().debug("rolled encounter", { worldId, templateId: drawn.id, difficulty, },);

  return { triggered: true, template: drawn, rollId: roll.id, reason: ROLL_REASONS.Triggered, };
}

/**
 * Attach an outcome to a recorded roll.
 *
 * The ledger row is the cooldown cursor, so the outcome write is the only
 * mutation it ever takes — which is why it can be applied once and re-run
 * idempotently by the caller that resolves rewards.
 * @param db Kysely handle
 * @param worldId world the roll must belong to
 * @param rollId roll to annotate
 * @param outcome arbitrary JSON payload describing what happened
 * @returns the roll row after the write
 * @throws {EncounterError} when no such roll exists in this world.
 */
export async function recordEncounterOutcome(
  { db, worldId, rollId, outcome, }: {
    db: Kysely<DB>;
    worldId: string;
    rollId: string;
    outcome: Record<string, unknown>;
  },
) {
  const updated = await db
    .updateTable("encounter_rolls",)
    .set({ outcome: jsonStringifyOr(outcome,), },)
    .where("id", "=", rollId,)
    .where("world_id", "=", worldId,)
    .returningAll()
    .executeTakeFirst();

  if (updated === undefined) { throw new EncounterError(`roll "${rollId}" does not exist`,); }
  return updated;
}
