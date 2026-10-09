// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Read-only CLI over `log_entries` (JSONL default, `--format table` for humans).
 * Single `SELECT` on a `{ readonly: true }` handle; `--limit` capped at `LIMIT_CAP`.
 */

import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import {
  choice,
  integer,
  object,
  option,
  optional,
  runScript,
  string,
  withDefault,
} from "../cli/parser";
import { loadConfig, } from "../config/load";
import { createSqliteDialect, } from "../db/index";
import type { DB, } from "../db/schema";
import { createLogger, getChildLogger, type Logger, } from "../logger";
import { jsonStringifyOr, } from "../utils/safe-json";

/** Rows returned when `--limit` is omitted. */
export const DEFAULT_LIMIT = 50;

/** Hard ceiling on `--limit`; larger values are clamped down. */
export const LIMIT_CAP = 500;

/** Null until the CLI guard calls `createLogger()`; keeps bare imports throw-free. */
const log = (): Logger | null => getChildLogger("scripts/log-query",);

/** Longest LIKE pattern accepted, mirroring the admin audit endpoint. */
export const LIKE_MAX = 200;

/** Columns selected — the same projection `GET /api/admin/audit` returns. */
const COLUMNS = [
  "id",
  "level",
  "message",
  "module",
  "event_type",
  "entity_type",
  "entity_id",
  "user_id",
  "session_id",
  "request_id",
  "meta",
  "action",
  "timestamp",
  "time",
  "created_at",
] as const;

/** One `log_entries` row as returned by {@link queryLogEntries}. */
export type LogEntry = {
  [K in (typeof COLUMNS)[number]]: string | number | null;
};

/** All optional. `entity` is `<type>[:<id>]`; `level` is a minimum severity; `q` is a message substring. */
export interface LogQueryFilters {
  event?: string;
  user?: string;
  entity?: string;
  entityType?: string;
  entityId?: string;
  level?: number;
  since?: string;
  until?: string;
  q?: string;
  limit?: number;
}

/** `created_at` is stored as `datetime('now')` → `"YYYY-MM-DD HH:MM:SS"` (UTC). */
const CREATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/;

/**
 * Normalise ISO-8601 into SQLite's `created_at` text form.
 * @param iso
 * @throws {Error} when `iso` is not a recognisable date/datetime
 */
export function normalizeTimestamp(iso: string,): string {
  const trimmed = iso.trim();
  if (!CREATED_AT_PATTERN.test(trimmed,)) {
    throw new Error(`Invalid ISO timestamp: "${iso}" (expected YYYY-MM-DD[THH:MM:SS])`,);
  }

  const normalized = trimmed
    .replace("T", " ",)
    .replace(/Z$/i, "",)
    .replace(/\..*$/, "",);

  return normalized.length === 10 ? `${normalized} 00:00:00` : normalized;
}

/**
 * Split a `<type>[:<id>]` selector; `entityId` is absent when not supplied.
 * @param value
 * @throws {Error} when either half of the selector is empty
 */
export function parseEntitySelector(
  value: string,
): { entityType: string; entityId?: string } {
  const separator = value.indexOf(":",);
  const entityType = separator === -1 ? value : value.slice(0, separator,);
  const entityId = separator === -1 ? undefined : value.slice(separator + 1,);
  if (entityType === "" || entityId === "") {
    throw new Error(`Invalid --entity selector: "${value}" (expected <type>[:<id>])`,);
  }

  return entityId === undefined ? { entityType, } : { entityType, entityId, };
}

/**
 * Clamp a requested row count into `[1, LIMIT_CAP]` (`undefined` yields `DEFAULT_LIMIT`).
 * @param limit
 */
export function clampLimit(limit?: number,): number {
  if (limit === undefined) { return DEFAULT_LIMIT; }
  return Math.max(1, Math.min(limit, LIMIT_CAP,),);
}

/**
 * Query `log_entries`. Read-only: a single `SELECT`, newest first, capped at `LIMIT_CAP`.
 * Ordering is `created_at DESC`, served by the composite indexes when a filter
 * narrows the leading column.
 * @param db
 * @param opts
 * @throws {Error} on a malformed `--entity` selector or ISO timestamp
 */
export async function queryLogEntries(
  db: Kysely<DB>,
  opts: LogQueryFilters = {},
): Promise<LogEntry[]> {
  const entity = opts.entity === undefined
    ? undefined
    : parseEntitySelector(opts.entity,);

  const entityType = entity?.entityType ?? opts.entityType;
  const entityId = entity?.entityId ?? opts.entityId;

  let query = db
    .selectFrom("log_entries",)
    .select([...COLUMNS,],)
    .orderBy("created_at", "desc",)
    .limit(clampLimit(opts.limit,),);

  if (opts.event !== undefined) { query = query.where("event_type", "=", opts.event,); }
  if (opts.user !== undefined) { query = query.where("user_id", "=", opts.user,); }
  if (entityType !== undefined) { query = query.where("entity_type", "=", entityType,); }
  if (entityId !== undefined) { query = query.where("entity_id", "=", entityId,); }
  if (opts.level !== undefined) { query = query.where("level", ">=", opts.level,); }
  if (opts.since !== undefined) {
    query = query.where("created_at", ">=", normalizeTimestamp(opts.since,),);
  }

  if (opts.until !== undefined) {
    query = query.where("created_at", "<=", normalizeTimestamp(opts.until,),);
  }

  // Leading-wildcard LIKE scans every row on a large audit table — cap the
  // pattern exactly like `src/routes/admin/audit.ts` does.
  if (opts.q !== undefined) {
    const pattern = opts.q.slice(0, LIKE_MAX,);
    query = query.where("message", "like", `%${pattern}%`,);
  }

  return query.execute() as Promise<LogEntry[]>;
}

/**
 * Render rows as a fixed-width table for humans.
 * @param entries
 */
export function formatTable(entries: LogEntry[],): string {
  const header = ["CREATED_AT", "LEVEL", "EVENT", "ENTITY", "USER", "MESSAGE",];
  const rows: string[][] = entries.map((entry,) => [
    String(entry.created_at ?? "-",),
    String(entry.level,),
    String(entry.event_type ?? "-",),
    entry.entity_id === null
      ? String(entry.entity_type ?? "-",)
      : `${entry.entity_type}:${entry.entity_id}`,
    String(entry.user_id ?? "-",),
    String(entry.message,).slice(0, 60,),
  ]);

  const widths = header.map((cell, i,) => Math.max(cell.length, ...rows.map((row,) => row[i]!.length),));

  const line = (cells: string[],): string => cells.map((cell, i,) => cell.padEnd(widths[i]!,)).join("  ",).trimEnd();

  return [line(header,), ...rows.map(line,),].join("\n",);
}

/** CLI entry point. @returns 0 on success, 1 on a bad selector/timestamp or unreadable DB */
export async function main(): Promise<number> {
  const parser = object({
    event: optional(option("--event", string(),),),
    user: optional(option("--user", string(),),),
    entity: optional(option("--entity", string(),),),
    level: optional(option("--level", integer({ min: 0, },),),),
    since: optional(option("--since", string(),),),
    until: optional(option("--until", string(),),),
    q: optional(option("--q", string(),),),
    limit: withDefault(option("--limit", integer({ min: 1, },),), DEFAULT_LIMIT,),
    format: withDefault(option("--format", choice(["jsonl", "table",] as const,),), "jsonl",),
  },);

  const args = runScript(parser, {
    programName: "logs:query",
    brief: "Query the log_entries table (READ-ONLY — never writes, updates, or deletes).",
    description: "Emits JSONL by default (one JSON object per log entry, jq-friendly). " +
      "All filters are optional; --event/--user/--entity hit the existing " +
      "log_entries indexes, and --limit is clamped to " + String(LIMIT_CAP,) + ". " +
      "--level is a minimum severity: 5 trace, 10 debug, 20 info, " +
      "30 warn, 40 error, 50 fatal. " +
      "Examples: --event moderation.chat.ban · --entity chat:c-123 --since 2026-10-01 " +
      "--limit 20 · --level 30 --format table",
    version: "0.1.0",
    help: "option",
    showDefault: true,
  },);

  const config = loadConfig();
  const sqliteFilename = config.db.sqliteFilename;
  if (!sqliteFilename || sqliteFilename === ":memory:") {
    log()?.error("requires a real on-disk DB; got:", undefined, { sqliteFilename, },);
    return 1;
  }

  let entries: LogEntry[];
  let sqlite: Database;
  try {
    sqlite = new Database(sqliteFilename, { readonly: true, },);
  } catch (error) {
    log()?.error(error instanceof Error ? error.message : String(error,), error instanceof Error ? error : undefined, {
      sqliteFilename,
    },);

    return 1;
  }

  try {
    const db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
    entries = await queryLogEntries(db, {
      event: args.event,
      user: args.user,
      entity: args.entity,
      level: args.level,
      since: args.since,
      until: args.until,
      q: args.q,
      limit: args.limit,
    },);
  } catch (error) {
    log()?.error(error instanceof Error ? error.message : String(error,), error instanceof Error ? error : undefined, {
      sqliteFilename,
    },);

    return 1;
  } finally {
    sqlite.close();
  }

  if (entries.length === 0) { return 0; }
  // Query output IS the product: JSONL for jq or an aligned table, asserted
  // verbatim by the operator piping it — a timestamped log line would corrupt it.
  // eslint-disable-next-line no-console
  console.log(
    args.format === "table"
      ? formatTable(entries,)
      : entries.map((entry,) => jsonStringifyOr(entry,)).join("\n",),
  );

  return 0;
}

// CLI guard: only run main when executed directly (not when imported).
if (import.meta.main) {
  createLogger({ level: "info", },);
  await main().then(async (code,) => {
    await log()?.flush().catch(() => undefined);
    process.exit(code,);
  },).catch(async (error: unknown,) => {
    log()?.error(error instanceof Error ? error.message : String(error,), error instanceof Error ? error : undefined,);
    await log()?.flush().catch(() => undefined);
    process.exit(1,);
  },);
}
