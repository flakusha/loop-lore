// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Async request-response result store.
 *
 * Captures the outcome (status, headers, body, error, timing) of every
 * tracked async request so the frontend can poll for completion via
 * `GET /api/requests/:id/status` and so the idempotency layer can replay a
 * previously-completed response verbatim.
 *
 * Why a dedicated table instead of reusing `telemetry_events` or
 * `log_entries`:
 *   - The body may be large (LLM completions, encrypted payloads) and is
 *     served on a poll endpoint — telemetry rollup/TTL is wrong shape.
 *   - Idempotency needs byte-exact response replay (status, headers, body)
 *     keyed by request id; log entries cannot guarantee that.
 *
 * Offload: rows whose `response_body` exceeds a size threshold are
 * compressed (gzip) and spilled to disk under `.tmp/async-store/`; the row
 * then carries `offloaded_at` + `offload_path` and the body column is
 * cleared. The status endpoint reads the spill file on miss.
 *
 * Lifecycle:
 *   pending    → row exists, no response yet (handler still running).
 *   in_progress → async work in flight (e.g. LLM streaming started).
 *   complete   → response captured, ready to replay / serve.
 *   failed     → handler threw; error captured.
 *   expired    → TTL elapsed; offloaded or evicted.
 *
 * @see TASK-async-request-response-result-store-separate-table-offload.md
 * @see epic-middleware-request-lifecycle.md
 */

import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("request_results",)
    .ifNotExists()
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("method", "text", (col,) => col.notNull(),)
    .addColumn("route_pattern", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text",)
    .addColumn("status", "text", (col,) => col.notNull(),)
    .addColumn("progress", "text",)
    .addColumn("response_status", "integer",)
    .addColumn("response_headers", "text",)
    .addColumn("response_body", "text",)
    .addColumn("error", "text",)
    .addColumn("started_at", "text", (col,) => col.notNull(),)
    .addColumn("completed_at", "text",)
    .addColumn("offloaded_at", "text",)
    .addColumn("offload_path", "text",)
    .execute();

  // Lookup index: status endpoint + idempotency replay resolve rows by id,
  // which is already the PK; add an index on (user_id, started_at DESC) so
  // we can prune or surface a user's recent requests without a full scan.
  await db.schema
    .createIndex("idx_request_results_user_started",)
    .ifNotExists()
    .on("request_results",)
    .columns(["user_id", "started_at",],)
    .execute();

  // Cleanup index: TTL eviction scans by (status, completed_at). The
  // expired-row sweep + offload daemon hit this path on every cron tick.
  await db.schema
    .createIndex("idx_request_results_status_completed",)
    .ifNotExists()
    .on("request_results",)
    .columns(["status", "completed_at",],)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropTable("request_results",).ifExists().execute();
}
