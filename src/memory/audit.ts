// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory audit log service (FEAT-075).
 *
 * Append-only service for recording memory lifecycle events
 * (create / pin / unpin / modify / decay / purge / inject) so users can
 * trace what happened to a memory — who created/pinned/modified it, when
 * decay removed it, and which memories were injected into prompts.
 *
 * `recordAuditLog` is the single write surface; `listAuditLog` is the
 * single read surface (cursor-paginated, action-filterable, date-bound).
 * Both are fire-and-await — the underlying table has no FK back to
 * `actor_memories` so audit rows survive memory deletion.
 * @module memory/audit
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../db";
import { getLogger, } from "../logger";
import { jsonStringifyOr, } from "../utils";

/**
 * @returns logger scoped to the memory-audit module
 */
function getLog() {
  return getLogger().child({ module: "memory-audit", },);
}

/** Lifecycle events recorded in `memory_audit_log.action`. */
export type MemoryAuditAction =
  | "create"
  | "pin"
  | "unpin"
  | "modify"
  | "decay"
  | "purge"
  | "inject"
  | "delete";

/** One row to append. `details` is freeform JSON (action-specific). */
export interface AuditLogEntry {
  memoryId: string;
  actorId: string;
  userId?: string | null;
  action: MemoryAuditAction;
  details?: Record<string, unknown>;
}

/** Audit row shape returned by the list endpoint. */
export interface MemoryAuditRow {
  id: string;
  memoryId: string;
  actorId: string;
  userId: string | null;
  action: MemoryAuditAction;
  details: Record<string, unknown>;
  createdAt: string;
}

/** Filters + cursor for `listAuditLog`. */
export interface ListAuditLogOpts {
  /** Restrict to a single action (e.g. "pin"). */
  action?: MemoryAuditAction;
  /** ISO 8601 lower bound on `created_at`. */
  since?: string;
  /** ISO 8601 upper bound on `created_at`. */
  until?: string;
  /** Opaque cursor from a previous page (created_at|memoryId encoded). */
  cursor?: string;
  /** Max rows to return (1..200, default 50). */
  limit?: number;
}

/** Default page size when caller omits `limit`. */
const DEFAULT_LIMIT = 50;
/** Hard cap so a runaway caller cannot drain a multi-million-row log. */
const MAX_LIMIT = 200;

/**
 * Decode an opaque cursor back into its `(created_at, id)` boundary.
 * Returns null on malformed input (caller treats as no cursor).
 * @param cursor
 */
function decodeCursor(cursor: string,): { createdAt: string; id: string } | null {
  // Format: base64url(json({c: "<iso>", i: "<uuid>"})). We accept any
  // parseable JSON with both fields rather than validating signature —
  // this is a pagination cursor, not a security token.
  try {
    const decoded = Buffer.from(cursor, "base64url",).toString("utf8",);
    const obj = JSON.parse(decoded,) as { c?: unknown; i?: unknown };
    if (typeof obj.c === "string" && obj.c.length > 0 && typeof obj.i === "string" && obj.i.length > 0) {
      return { createdAt: obj.c, id: obj.i, };
    }
    return null;
  } catch { return null; }
}

/**
 * Encode the next page cursor. Returns undefined when the page is the last
 * (fewer rows than `limit`).
 * @param lastRow
 * @param _requestedLimit - reserved for future use; not consumed today
 */
function encodeNextCursor(lastRow: MemoryAuditRow, _requestedLimit: number,): string | undefined {
  // Cursor encodes the last seen (created_at, id) so ties on
  // created_at (possible at second resolution) advance correctly via
  // the compound comparison in the query.
  return Buffer.from(JSON.stringify({ c: lastRow.createdAt, i: lastRow.id, },),).toString("base64url",);
}

/**
 * Append one or more audit rows in a single statement.
 * Errors are logged but never thrown — audit is observational, not
 * load-bearing for the user's primary action.
 * @param db - Kysely instance
 * @param entries - one or more rows to append
 */
export async function recordAuditLog(
  db: Kysely<DB>,
  entries: AuditLogEntry[],
): Promise<void> {
  if (entries.length === 0) { return; }
  const now = new Date().toISOString();
  const rows = entries.map((e,) => ({
    id: randomUUID(),
    memory_id: e.memoryId,
    actor_id: e.actorId,
    user_id: e.userId ?? null,
    action: e.action,
    details: jsonStringifyOr(e.details ?? {},),
    created_at: now,
  }),);
  try {
    await db.insertInto("memory_audit_log",).values(rows,).execute();
  } catch (error) {
    getLog().warn("recordAuditLog failed", {
      error: (error as Error).message,
      count: entries.length,
    },);
  }
}

/**
 * List audit rows for an actor, newest-first, cursor-paginated.
 *
 * Pagination: rows ordered by `created_at DESC`. The cursor encodes the
 * last seen timestamp; the next query returns strictly newer rows. We
 * include `memoryId` in tie-breaking when timestamps collide by
 * filtering `(created_at, memoryId) < (cursor, lastSeenId)` via raw SQL.
 *
 * @param db - Kysely instance
 * @param actorId - actor whose audit log to read
 * @param opts - filters and cursor
 * @returns page of rows + opaque next cursor
 */
export async function listAuditLog(
  db: Kysely<DB>,
  actorId: string,
  opts: ListAuditLogOpts = {},
): Promise<{ entries: MemoryAuditRow[]; nextCursor?: string }> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, opts.limit ?? DEFAULT_LIMIT,),);

  let query = db
    .selectFrom("memory_audit_log",)
    .select(["id", "memory_id", "actor_id", "user_id", "action", "details", "created_at",],)
    .where("actor_id", "=", actorId,)
    .orderBy("created_at", "desc",)
    .orderBy("id", "desc",)
    .limit(limit + 1,);

  if (opts.action) { query = query.where("action", "=", opts.action,); }
  if (opts.since) { query = query.where("created_at", ">=", opts.since,); }
  if (opts.until) { query = query.where("created_at", "<=", opts.until,); }
  if (opts.cursor) {
    const decoded = decodeCursor(opts.cursor,);
    if (decoded) {
      // Compound cursor: advance past the last (created_at, id) pair.
      // SQLite tuple comparison isn't directly available, so we OR two
      // conditions that together implement strict-less-than on the
      // (created_at DESC, id DESC) ordering.
      query = query.where((eb,) =>
        eb.or([
          eb("created_at", "<", decoded.createdAt,),
          eb.and([
            eb("created_at", "=", decoded.createdAt,),
            eb("id", "<", decoded.id,),
          ]),
        ],),
      );
    }
  }

  const rawRows = await query.execute();
  const hasMore = rawRows.length > limit;
  const pageRows = hasMore ? rawRows.slice(0, limit,) : rawRows;

  const entries: MemoryAuditRow[] = [];
  for (const r of pageRows) {
    let details: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(r.details,) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed,)) {
        details = parsed as Record<string, unknown>;
      }
    } catch { /* leave empty */ }
    entries.push({
      id: r.id,
      memoryId: r.memory_id,
      actorId: r.actor_id,
      userId: r.user_id,
      action: r.action as MemoryAuditAction,
      details,
      createdAt: r.created_at,
    },);
  }

  const nextCursor = hasMore && entries.length > 0
    ? encodeNextCursor(entries[entries.length - 1]!, limit,)
    : undefined;

  return { entries, nextCursor, };
}
