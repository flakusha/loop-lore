// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { jsonStringifyOr, uid, } from "../utils";

/**
 * Shared status-effect store (TASK-035/039/044).
 *
 * One `status_effect` row per applied effect (arousal, exhaustion,
 * aphrodisiac, trauma, ...). Expiry is computed on read by comparing
 * `expires_at` to now — no timers; `sweepExpiredEffects` (wired as the
 * `nsfw.status-sweep` cron job) deletes expired rows. All NSFW domain
 * modules (body, chemistry, trauma) read/write through these helpers;
 * no private transient-state stores beside them.
 */

/** Options for applying a status effect. */
export interface ApplyStatusEffectOpts {
  actorId: string;
  effectId: string;
  category: string;
  magnitude?: number;
  affectedStat?: string | null;
  source: string;
  sourceId?: string | null;
  /** Lifetime in seconds; omitted = no expiry. */
  durationSeconds?: number | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Apply a status effect row.
 * @param db
 * @param opts
 * @returns The new row id.
 */
export async function applyStatusEffect(
  db: Kysely<DB>,
  opts: ApplyStatusEffectOpts,
): Promise<string> {
  const now = new Date();
  const id = uid();
  await db
    .insertInto("status_effect",)
    .values({
      id,
      actor_id: opts.actorId,
      effect_id: opts.effectId,
      category: opts.category,
      affected_stat: opts.affectedStat ?? null,
      magnitude: opts.magnitude ?? 0,
      source: opts.source,
      source_id: opts.sourceId ?? null,
      started_at: now.toISOString(),
      expires_at: opts.durationSeconds != null
        // eslint-disable-next-line no-restricted-syntax -- epoch-ms arithmetic is allowed; toDate() cannot add durations
        ? new Date(now.getTime() + opts.durationSeconds * 1000,).toISOString()
        : null,
      meta: opts.meta ? jsonStringifyOr(opts.meta,) : null,
    },)
    .execute();
  return id;
}

export interface ActiveStatusEffect {
  id: string;
  effectId: string;
  category: string;
  magnitude: number;
  source: string;
  sourceId: string | null;
  startedAt: string;
  expiresAt: string | null;
  meta: string | null;
}

/**
 * Read non-expired effect rows for an actor, optionally filtered by
 * category and/or effect id. Expiry is computed on read — callers never
 * see stale rows even between sweeps.
 * @param db
 * @param actorId
 * @param filter
 */
export async function getActiveEffects(
  db: Kysely<DB>,
  actorId: string,
  filter?: { category?: string; effectId?: string },
): Promise<ActiveStatusEffect[]> {
  const now = new Date().toISOString();
  let query = db
    .selectFrom("status_effect",)
    .where("actor_id", "=", actorId,)
    .where((eb,) =>
      eb.or([
        eb("expires_at", "is", null,),
        eb("expires_at", ">", now,),
      ],)
    );
  if (filter?.category !== undefined) {
    query = query.where("category", "=", filter.category,);
  }
  if (filter?.effectId !== undefined) {
    query = query.where("effect_id", "=", filter.effectId,);
  }
  const rows = await query.selectAll().execute();
  return rows.map((row,) => ({
    id: row.id,
    effectId: row.effect_id,
    category: row.category,
    magnitude: row.magnitude,
    source: row.source,
    sourceId: row.source_id,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    meta: row.meta,
  }));
}

/**
 * Delete all expired `status_effect` rows. Wired as the
 * `nsfw.status-sweep` cron job; safe to run at any cadence.
 * @param db
 * @returns Number of rows deleted.
 */
export async function sweepExpiredEffects(db: Kysely<DB>,): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .deleteFrom("status_effect",)
    .where("expires_at", "is not", null,)
    .where("expires_at", "<=", now,)
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0n,);
}
