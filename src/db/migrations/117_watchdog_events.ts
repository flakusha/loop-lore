// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 117_watchdog_events
 *
 * Append-only exec log for the watchdog state machine. The supervisor emits
 * one row per folded transition through its `onTransition` seam; the kinds and
 * reason values mirror `WatchdogEventKind` / `WatchdogDecision` in
 * src/server/watchdog/state.ts — this table stores the outcome, it never
 * re-derives a policy (backoff curve, thresholds and constants stay in
 * state.ts and the external-server supervise module).
 *
 * - `at_ms` is the clock reading carried by the transition; `created_at` is
 *   the write time. Both are kept because a replayed/injected clock can differ
 *   from wall-clock time.
 * - `reason` / `misses` / `crashes` copy the decision's optional fields; they
 *   are NULL on decisions that do not carry them.
 * - No FKs: the log must outlive any supervised child or admin session.
 *
 * Numbering: 116 is claimed by the unlanded `rsi-agent-actions` lane, so this
 * first slice takes 117 to avoid a collision when both branches land.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("watchdog_events",)
    .addColumn("id", "integer", (col,) => col.primaryKey(),)
    .addColumn("event_kind", "text", (col,) => col.notNull(),)
    .addColumn("decision_kind", "text", (col,) => col.notNull(),)
    .addColumn("at_ms", "integer", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("reason", "text",)
    .addColumn("misses", "integer",)
    .addColumn("crashes", "integer",)
    .addCheckConstraint(
      "ck_watchdog_events_event_kind",
      sql`event_kind IN ('probe', 'crash')`,
    )
    .addCheckConstraint(
      "ck_watchdog_events_decision_kind",
      sql`decision_kind IN ('restart', 'kill', 'stop', 'wait')`,
    )
    .addCheckConstraint(
      "ck_watchdog_events_numerics",
      sql`(misses IS NULL OR misses >= 0) AND (crashes IS NULL OR crashes >= 0)`,
    )
    .execute();

  // The admin read path lists the newest N, so index the clock column.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_watchdog_events_at_ms
    ON watchdog_events (at_ms DESC)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_watchdog_events_at_ms`.execute(database,);
  await database.schema.dropTable("watchdog_events",).ifExists().execute();
}
