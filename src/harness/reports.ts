// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 260
// Single cohesive report-store module; cluster query shares its filters.

/**
 * Tooling report store — write/read side of the cross-source
 * tooling-failure report store (TASK-tooling-report-store-and-ingest-api).
 *
 * Two sinks, deliberately NOT atomic (the DB wins on disagreement):
 * - the `tooling_reports` DB table — the queryable, deduped store the API
 *   reads. A DB failure throws: the route answers 500 and no partial row is
 *   left behind (single-statement writes inside one transaction).
 * - a best-effort JSONL spool at `<instance-dir>/harness/reports.jsonl`,
 *   mirroring src/harness/exec-log.ts conventions (snake_case wire names,
 *   safeJsonStringify, one warn then silence). A spool failure NEVER fails
 *   the report — the spool is only written after the DB write committed.
 *
 * Dedupe semantics: a report carrying `dedupeKey` whose key already exists
 * bumps `count` and refreshes `last_seen` on the existing row instead of
 * inserting — one row per persistent-failure cluster, and `count` is the
 * repeat signal the cluster miner (RSI #20) thresholds on. NULL keys always
 * insert.
 */
import { type Kysely, type Selectable, sql, } from "kysely";
import { resolveInstanceSlug, } from "../config/state-dir";
import type { DB, } from "../db/schema";
import { writeReportSpool, } from "./reports-spool";

/** Report sources, as a runtime list; the union derives from it. */
export const REPORT_SOURCES = ["assistant", "harness", "giwt", "check",] as const;

/** A report source. */
export type ReportSource = (typeof REPORT_SOURCES)[number];

/** Report categories, as a runtime list; the union derives from it. */
export const REPORT_CATEGORIES = [
  "tooling_failure",
  "retry_exhausted",
  "persistent_failure",
  "performance",
] as const;

/** A report category. */
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/**
 * Character cap on `detail` — the same 8 KiB budget the telemetry ingest
 * caps `event_data` at; anything longer is a log dump, not a summary.
 */
export const REPORT_DETAIL_MAX_CHARS = 8_192;

/** Soft cap on the short descriptive fields (tool, profile, branch, ...). */
export const REPORT_FIELD_MAX_CHARS = 512;

/** Default page size for {@link listToolingReports}. */
export const REPORTS_DEFAULT_LIMIT = 50;

/** Hard ceiling on a caller-supplied limit, so `?limit=999999` is not a scan. */
export const REPORTS_MAX_LIMIT = 200;

/** One ingested tooling report, as stored in `tooling_reports`. */
export type ToolingReportRow = Selectable<DB["tooling_reports"]>;

/** One report payload (camelCase; the wire shape is the route's concern). */
export interface ToolingReportInput {
  source: string;
  category: string;
  tool: string;
  detail: string;
  attempt?: number;
  maxAttempts?: number;
  durationMs?: number;
  profile?: string;
  branch?: string;
  gitSha?: string;
  dedupeKey?: string;
  /** Explicit stamp override (tests, importers); defaults to this process's instance slug. */
  instanceId?: string;
  /** Clock seam (tests); defaults to now. */
  ts?: string;
}

/** Fielded validation verdict for one report payload. */
export type ReportValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validate one report payload's semantics. The wire schema (TypeBox) only
 * checks shapes — these are the closed-set / cross-field rules (unknown
 * source/category, attempt > max_attempts, negative duration_ms, over-long
 * detail), kept in the store so the route can answer them with a 400 instead
 * of the app-wide 422 shape-mismatch envelope.
 * @param input - the report payload to check
 * @returns `{ ok: true }`, or `{ ok: false, error }` naming the first problem.
 */
export function validateReportInput(input: ToolingReportInput,): ReportValidationResult {
  if (!(REPORT_SOURCES as readonly string[]).includes(input.source,)) {
    return {
      ok: false,
      error: `unknown source "${input.source}" (expected one of: ${REPORT_SOURCES.join(", ",)})`,
    };
  }

  if (!(REPORT_CATEGORIES as readonly string[]).includes(input.category,)) {
    return {
      ok: false,
      error: `unknown category "${input.category}" (expected one of: ${REPORT_CATEGORIES.join(", ",)})`,
    };
  }

  if (typeof input.tool !== "string" || input.tool.trim().length === 0) {
    return { ok: false, error: "tool is required", };
  }

  if (input.tool.length > REPORT_FIELD_MAX_CHARS) {
    return { ok: false, error: `tool exceeds ${REPORT_FIELD_MAX_CHARS} characters`, };
  }

  if (input.detail.length > REPORT_DETAIL_MAX_CHARS) {
    return { ok: false, error: `detail exceeds ${REPORT_DETAIL_MAX_CHARS} characters`, };
  }

  const numerics = [
    ["attempt", input.attempt,],
    ["max_attempts", input.maxAttempts,],
    ["duration_ms", input.durationMs,],
  ] as const;

  for (const [name, value,] of numerics) {
    if (value !== undefined && (!Number.isInteger(value,) || value < 0)) {
      return { ok: false, error: `${name} must be a non-negative integer`, };
    }
  }

  if (input.attempt !== undefined && input.maxAttempts !== undefined && input.attempt > input.maxAttempts) {
    return {
      ok: false,
      error: `attempt (${input.attempt}) exceeds max_attempts (${input.maxAttempts})`,
    };
  }

  const strings = [
    ["profile", input.profile,],
    ["branch", input.branch,],
    ["git_sha", input.gitSha,],
    ["dedupe_key", input.dedupeKey,],
  ] as const;

  for (const [name, value,] of strings) {
    if (value !== undefined && value.length > REPORT_FIELD_MAX_CHARS) {
      return { ok: false, error: `${name} exceeds ${REPORT_FIELD_MAX_CHARS} characters`, };
    }
  }

  return { ok: true, };
}

/** Successful insert verdict: the stored row and whether it was a dedupe bump. */
export type InsertReportOk = { ok: true; report: ToolingReportRow; deduped: boolean };

/** Insert verdict; `error` is a client-fixable payload problem (route → 400). */
export type InsertReportResult = InsertReportOk | { ok: false; error: string };

/**
 * Validate and store one tooling report. Keyed reports upsert: when the
 * `dedupe_key` already has an open row, that row's `count` is incremented
 * and `last_seen` refreshed instead of inserting a second row. The JSONL
 * spool receives the stored row best-effort after the DB write commits.
 * @param database - the Kysely DB handle
 * @param input - the report payload (validated first; invalid → ok:false)
 * @returns the stored row plus whether it was a dedupe bump, or the
 *   validation error.
 * @throws when the DB write fails — the spool is never the reason (it is
 *   best-effort and swallowed); the route turns the throw into a 500.
 */
export async function insertToolingReport(
  database: Kysely<DB>,
  input: ToolingReportInput,
): Promise<InsertReportResult> {
  const verdict = validateReportInput(input,);
  if (!verdict.ok) { return verdict; }

  // The writer stamps its own instance unless a caller (test, importer)
  // says otherwise — every row stays attributable.
  const instanceId = input.instanceId ?? resolveInstanceSlug(process.env,);
  const now = input.ts ?? new Date().toISOString();
  const values = {
    ts: now,
    source: input.source,
    category: input.category,
    tool: input.tool,
    attempt: input.attempt ?? null,
    max_attempts: input.maxAttempts ?? null,
    detail: input.detail,
    duration_ms: input.durationMs ?? null,
    profile: input.profile ?? null,
    branch: input.branch ?? null,
    git_sha: input.gitSha ?? null,
    instance_id: instanceId,
    dedupe_key: input.dedupeKey ?? null,
    last_seen: input.dedupeKey != null ? now : null,
  };

  if (values.dedupe_key !== null) {
    // UPDATE-then-INSERT inside one transaction. Two concurrent first
    // reports of a fresh key race on this path; the partial unique index
    // turns the loser's INSERT into SQLITE_CONSTRAINT_UNIQUE, retried as
    // the bump it semantically was — the index closes the TOCTOU, not the
    // check.
    const deduped = await database.transaction().execute(async (trx,) => {
      const bumped = await trx
        .updateTable("tooling_reports",)
        .set({ count: sql`count + 1`, last_seen: now, },)
        .where("dedupe_key", "=", values.dedupe_key!,)
        .executeTakeFirst();

      if (Number(bumped.numUpdatedRows,) > 0) { return true; }
      try {
        await trx.insertInto("tooling_reports",).values(values,).execute();
        return false;
      } catch (error) {
        if (error instanceof Error && error.message.includes("UNIQUE constraint failed",)) {
          await trx
            .updateTable("tooling_reports",)
            .set({ count: sql`count + 1`, last_seen: now, },)
            .where("dedupe_key", "=", values.dedupe_key!,)
            .execute();

          return true;
        }

        throw error;
      }
    },);

    const report = await database
      .selectFrom("tooling_reports",)
      .selectAll()
      .where("dedupe_key", "=", values.dedupe_key!,)
      .executeTakeFirstOrThrow();

    writeReportSpool(report,);
    return { ok: true, report, deduped, };
  }

  const report = await database
    .insertInto("tooling_reports",)
    .values(values,)
    .returningAll()
    .executeTakeFirstOrThrow();

  writeReportSpool(report,);
  return { ok: true, report, deduped: false, };
}

/** Filters + page for {@link listToolingReports}; `instanceId` is REQUIRED. */
export interface ReportFilter {
  /** Caller's instance slug — rows from any other instance are invisible. */
  instanceId: string;
  source?: string;
  category?: string;
  /** Exact tool-name filter. */
  tool?: string;
  /** Exact dedupe-key filter ("show me this cluster"). */
  dedupeKey?: string;
  limit?: number;
  offset?: number;
}

/** One page of reports, newest first, with the unpaginated total. */
export interface ReportPage {
  items: ToolingReportRow[];
  total: number;
}

/**
 * List reports for ONE instance, newest first. The instance scope is the
 * caller's responsibility and mandatory: cross-instance reads are a
 * caller bug, not a filter value.
 * @param database - the Kysely DB handle
 * @param filter - instance scope + optional filters + page (`limit` capped
 *   at {@link REPORTS_MAX_LIMIT}, `offset` floored at 0)
 * @returns the page plus the unpaginated total for the same filters.
 * @throws on DB failure (route → 500).
 */
export async function listToolingReports(
  database: Kysely<DB>,
  filter: ReportFilter,
): Promise<ReportPage> {
  const limit = Math.min(Math.max(1, filter.limit ?? REPORTS_DEFAULT_LIMIT,), REPORTS_MAX_LIMIT,);
  const offset = Math.max(0, filter.offset ?? 0,);

  let base = database
    .selectFrom("tooling_reports",)
    .where("instance_id", "=", filter.instanceId,);

  if (filter.source !== undefined) { base = base.where("source", "=", filter.source,); }
  if (filter.category !== undefined) { base = base.where("category", "=", filter.category,); }
  if (filter.tool !== undefined) { base = base.where("tool", "=", filter.tool,); }
  if (filter.dedupeKey !== undefined) { base = base.where("dedupe_key", "=", filter.dedupeKey,); }

  const totalRow = await base
    .select((eb,) => eb.fn.count<number>("id",).as("total",))
    .executeTakeFirst();

  const items = await base
    .selectAll()
    .orderBy("ts", "desc",)
    .limit(limit,)
    .offset(offset,)
    .execute();

  return { items, total: totalRow?.total ?? 0, };
}

/** Query for {@link listPersistentFailureClusters}; `instanceId` is REQUIRED. */
export interface PersistentFailureClusterFilter {
  /** Caller's instance slug — rows from any other instance are invisible. */
  instanceId: string;
  /** Minimum repeat count for a cluster (default 3). */
  threshold?: number;
}

/**
 * List this instance's persistent-failure cluster rows at or above `threshold`.
 * Instance scope is mandatory, exactly as in {@link listToolingReports} — a
 * shared DB must never leak another instance's clusters into a report.
 * @param database - the Kysely DB handle
 * @param filter - instance scope + minimum repeat count (default 3)
 * @returns matching rows (the ingest upsert keeps one row per `dedupe_key`),
 *   most frequent first
 * @throws on DB failure.
 */
export async function listPersistentFailureClusters(
  database: Kysely<DB>,
  { instanceId, threshold = 3, }: PersistentFailureClusterFilter,
): Promise<ToolingReportRow[]> {
  return database
    .selectFrom("tooling_reports",)
    .selectAll()
    .where("instance_id", "=", instanceId,)
    .where("category", "=", "persistent_failure",)
    .where("count", ">=", threshold,)
    .orderBy("count", "desc",)
    .orderBy("ts", "desc",)
    .execute();
}
