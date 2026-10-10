// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Agency quality metrics — `interaction_logs.agency_mode` writer and
 * hourly/daily counter upsert.
 *
 * Pure-Kysely writes, no LLM, no UI. Telemetry only.
 *
 * @module services/agency/quality-metrics
 */

import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db";
import { AgencyDimension, AgencyMode, } from "../../db/enums";
import { createLogger, getLogger, } from "../../logger";

// Lazy logger init — module body must not throw if the global logger
// has not been initialized yet (e.g. direct module import in tests).
try {
  getLogger();
} catch {
  createLogger({ level: "error", },);
}

const log = getLogger().child({ module: "agency/quality-metrics", },);

/**
 * Stamp the agency mode on an existing `interaction_logs` row.
 * @param db
 * @param logId - interaction_logs.id
 * @param mode
 * @returns {Promise<void>}
 */
export async function recordAgencyMode(
  db: Kysely<DB>,
  logId: string,
  mode: AgencyMode,
): Promise<void> {
  await db
    .updateTable("interaction_logs",)
    .set({ agency_mode: mode, },)
    .where("id", "=", logId,)
    .execute();

  log.debug("agency_mode recorded", { logId, mode, },);
}

/**
 * Stamp the decision outcome on an existing `interaction_logs` row's
 * `action_type` column. Vocabulary: `utility:<reaction-kind>` for a
 * utility-scorer winner (e.g. `utility:attack`) and `bdi:<step>` for a
 * BDI reflection step (e.g. `bdi:priority_shift`, `bdi:plan_created`).
 *
 * Companion to {@link recordAgencyMode} — together they feed the two
 * decision-telemetry columns the decision epic calls for.
 *
 * @param db
 * @param logId - interaction_logs.id
 * @param actionType - `utility:<kind>` or `bdi:<step>` token
 */
export async function recordActionType(
  db: Kysely<DB>,
  logId: string,
  actionType: string,
): Promise<void> {
  await db
    .updateTable("interaction_logs",)
    .set({ action_type: actionType, },)
    .where("id", "=", logId,)
    .execute();

  log.debug("action_type recorded", { logId, actionType, },);
}

/**
 * Stamp the latest `interaction_logs` row of one actor with a decision
 * outcome — the production write path for per-actor decision telemetry.
 *
 * The nightly BDI cycle is not itself a chat interaction, so there is no
 * log row to create; the stamp lands on the actor's most recent logged
 * interaction. Actors with no interaction log are a silent no-op.
 *
 * @param db
 * @param actorId
 * @param actionType - `bdi:<step>` or `utility:<kind>` token
 */
export async function recordActorDecisionType(
  db: Kysely<DB>,
  actorId: string,
  actionType: string,
): Promise<void> {
  const row = await db
    .selectFrom("interaction_logs",)
    .select("id",)
    .where("actor_id", "=", actorId,)
    .orderBy("created_at", "desc",)
    .executeTakeFirst();

  if (!row) {
    log.debug("no interaction log for actor — decision not stamped", { actorId, actionType, },);
    return;
  }

  await recordActionType(db, row.id, actionType,);
}

/**
 * Upsert a dimension counter row. Increments `count` (and `meaningful`
 * if the agency event was consequential) on the (world, chat, dimension,
 * hour_bucket) tuple.
 *
 * ponytail: agency_play_counters hour-bucket is coarse UTC; switch to
 * per-scene buckets when telemetry proves coarse insufficient.
  * @param {Kysely<DB>} db
 * @param {{
    worldId?: string | null;
    chatId: string;
    actorId?: string | null;
    dimension: AgencyDimension;
    hourBucket?: string;
    meaningful: boolean;
  }} params
 * @param params.worldId
 * @param params.chatId
 * @param params.actorId
 * @param params.dimension
 * @param params.hourBucket
 * @param params.meaningful
 * @returns {Promise<void>}
*/
export async function incrementDimensionCounter(
  db: Kysely<DB>,
  params: {
    worldId?: string | null;
    chatId: string;
    actorId?: string | null;
    dimension: AgencyDimension;
    hourBucket?: string;
    meaningful: boolean;
  },
): Promise<void> {
  const hourBucket = params.hourBucket ?? currentHourBucket();
  const day = hourBucket.slice(0, 10,); // YYYY-MM-DD prefix from YYYY-MM-DDTHH.

  // hourly counter — atomic upsert via UNIQUE(chat_id, dimension, hour_bucket).
  await sql`
    INSERT INTO agency_play_counters (id, world_id, chat_id, dimension, actor_id, count, hour_bucket, created_at)
    VALUES (lower(hex(randomblob(16))), ${params.worldId ?? null}, ${params.chatId}, ${params.dimension}, ${
    params.actorId ?? null
  }, 1, ${hourBucket}, datetime('now'))
    ON CONFLICT (chat_id, dimension, hour_bucket)
    DO UPDATE SET count = count + 1
  `.execute(db,);

  // daily rollup — atomic upsert via UNIQUE(world_id, dimension, day).
  if (params.meaningful) {
    await sql`
      INSERT INTO agency_dimension_counters (id, world_id, dimension, day, total, meaningful, created_at)
      VALUES (lower(hex(randomblob(16))), ${params.worldId ?? null}, ${params.dimension}, ${day}, 1, 1, datetime('now'))
      ON CONFLICT (world_id, dimension, day)
      DO UPDATE SET total = total + 1, meaningful = meaningful + 1
    `.execute(db,);
  } else {
    await sql`
      INSERT INTO agency_dimension_counters (id, world_id, dimension, day, total, meaningful, created_at)
      VALUES (lower(hex(randomblob(16))), ${params.worldId ?? null}, ${params.dimension}, ${day}, 1, 0, datetime('now'))
      ON CONFLICT (world_id, dimension, day)
      DO UPDATE SET total = total + 1
    `.execute(db,);
  }
}

/**
 * Query rollup metrics for a world since a given ISO date.
 * @param {Kysely<DB>} db
 * @param {string} worldId
 * @param {string} since
 * @returns {Promise<{ total: number; meaningful: number; byDimension: Record<AgencyDimension, { total: number; meaningful: number; }>; }>}
 */
export async function queryAgencyMetrics(
  db: Kysely<DB>,
  worldId: string,
  since: string,
): Promise<
  { total: number; meaningful: number; byDimension: Record<AgencyDimension, { total: number; meaningful: number }> }
> {
  const rows = await db
    .selectFrom("agency_dimension_counters",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("day", ">=", since,)
    .execute();

  const byDimension = {} as Record<AgencyDimension, { total: number; meaningful: number }>;
  for (const dim of Object.values(AgencyDimension,)) { byDimension[dim] = { total: 0, meaningful: 0, }; }
  let total = 0;
  let meaningful = 0;
  for (const r of rows) {
    const dim = r.dimension as AgencyDimension;
    if (!(dim in byDimension)) { continue; }
    byDimension[dim].total += r.total;
    byDimension[dim].meaningful += r.meaningful;
    total += r.total;
    meaningful += r.meaningful;
  }

  return { total, meaningful, byDimension, };
}

function currentHourBucket(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1,).padStart(2, "0",)}-${
    String(d.getUTCDate(),).padStart(2, "0",)
  }T${String(d.getUTCHours(),).padStart(2, "0",)}`;
}
