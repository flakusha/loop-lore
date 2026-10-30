// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model Rankings Store — append-only history for model measurements.
 *
 * One table, three scopes: 'global' (a board's opinion), 'instance'
 * (this box), 'hardware' (a hardware class). `basis` is the trust
 * label rendered next to every number: 'measured' (benched here,
 * never expires), 'community' / 'imported' (row date + 180 d),
 * 'formula' (llmfit estimate, 7 d or until the hardware changes).
 *
 * Write path is idempotent: re-ingesting the same
 * (scope, scope_key, subject_key, metric, source, observed_at) is a
 * no-op via the unique ingest index. Read path is latest-wins.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonStringifyOr, } from "../utils";
import { toDate, } from "../utils/date";

/** One measurement row. `value` unit depends on `metric` (see `unit`). */
export interface RankingRecord {
  scope: string;
  scopeKey: string;
  subjectKey: string;
  metric: string;
  value: number;
  unit?: string | null;
  basis: string;
  source: string;
  sourceVersion?: string | null;
  sourceRef?: string | null;
  observedAt: string;
  expiresAt?: string | null;
  meta?: Record<string, unknown> | null;
}

/** Latest-wins query. Omitted fields mean "any". */
export interface LatestRankingsQuery {
  scope?: string;
  scopeKey?: string;
  subjectKey?: string;
  metric?: string;
  source?: string;
}

/**
 * Record one measurement. Idempotent on re-ingest (unique ingest index).
 * @param db
 * @param record - the measurement to append
 * @returns true when a new row was written, false when already present
 */
export async function recordRanking(db: Kysely<DB>, record: RankingRecord,): Promise<boolean> {
  const existing = await db
    .selectFrom("model_rankings",)
    .where("scope", "=", record.scope,)
    .where("scope_key", "=", record.scopeKey,)
    .where("subject_key", "=", record.subjectKey,)
    .where("metric", "=", record.metric,)
    .where("source", "=", record.source,)
    .where("observed_at", "=", record.observedAt,)
    .select("id",)
    .executeTakeFirst();

  if (existing) { return false; }

  await db
    .insertInto("model_rankings",)
    .values({
      id: crypto.randomUUID(),
      scope: record.scope,
      scope_key: record.scopeKey,
      subject_key: record.subjectKey,
      metric: record.metric,
      value: record.value,
      unit: record.unit ?? null,
      basis: record.basis,
      source: record.source,
      source_version: record.sourceVersion ?? null,
      source_ref: record.sourceRef ?? null,
      observed_at: record.observedAt,
      expires_at: record.expiresAt ?? null,
      meta: record.meta ? jsonStringifyOr(record.meta,) : "{}",
    },)
    .execute();

  return true;
}

interface RankingRow {
  scope: string;
  scope_key: string;
  subject_key: string;
  metric: string;
  value: number;
  unit: string | null;
  basis: string;
  source: string;
  source_version: string | null;
  source_ref: string | null;
  observed_at: string;
  expires_at: string | null;
  meta: string;
}

/**
 * Latest row per (scope, scope_key, subject_key, metric), newest
 * `observed_at` wins. Unfiltered full-table scan — callers MUST narrow
 * by at least one of scope/subject/metric in production use.
 * @param db
 * @param query - optional narrowing filters
 */
export async function latestRankings(db: Kysely<DB>, query: LatestRankingsQuery = {},): Promise<RankingRow[]> {
  let qb = db.selectFrom("model_rankings",).selectAll();
  if (query.scope) { qb = qb.where("scope", "=", query.scope,); }
  if (query.scopeKey) { qb = qb.where("scope_key", "=", query.scopeKey,); }
  if (query.subjectKey) { qb = qb.where("subject_key", "=", query.subjectKey,); }
  if (query.metric) { qb = qb.where("metric", "=", query.metric,); }
  if (query.source) { qb = qb.where("source", "=", query.source,); }
  const rows = await qb
    .orderBy("observed_at", "desc",)
    .execute() as RankingRow[];

  const seen = new Set<string>();
  const latest: RankingRow[] = [];
  for (const row of rows) {
    const key = `${row.scope}|${row.scope_key}|${row.subject_key}|${row.metric}`;
    if (seen.has(key,)) { continue; }
    seen.add(key,);
    latest.push(row,);
  }

  return latest;
}

/**
 * Volume prune (telemetry-cleanup pattern): delete `basis='measured'`
 * rows older than 180 days, keeping the latest row per subject so the
 * current reading is never pruned away. `imported` rows are expiry-
 * driven (`expires_at`), not volume-driven.
 * @param db
 * @returns number of rows deleted
 */
export async function pruneRankings(db: Kysely<DB>,): Promise<number> {
  const cutoff = toDate(Date.now() - 180 * 86_400_000,).toISOString();
  const stale = await db
    .selectFrom("model_rankings",)
    .where("basis", "=", "measured",)
    .where("observed_at", "<", cutoff,)
    .select(["id", "scope", "scope_key", "subject_key", "metric", "observed_at",],)
    .execute();

  let deleted = 0;
  for (const row of stale) {
    const newer = await db
      .selectFrom("model_rankings",)
      .where("scope", "=", row.scope,)
      .where("scope_key", "=", row.scope_key,)
      .where("subject_key", "=", row.subject_key,)
      .where("metric", "=", row.metric,)
      .where("observed_at", ">", row.observed_at,)
      .select("id",)
      .executeTakeFirst();

    if (!newer) { continue; }
    await db.deleteFrom("model_rankings",).where("id", "=", row.id,).execute();
    deleted++;
  }

  getLogger().child({ module: "model-rankings", },).info("Ranking prune complete", { deleted, cutoff, },);
  return deleted;
}
