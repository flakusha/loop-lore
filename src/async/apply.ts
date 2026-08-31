// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Apply a single queued write to the request_results table.
 *
 * Extracted from `store.ts` to keep that file under the project's 250-line
 * size gate. The queue drains via this function; failures are logged but
 * never thrown on the hot path.
 * @see TASK-async-request-response-result-store-separate-table-offload.md
 * @see epic-middleware-request-lifecycle.md
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { jsonStringifyOr, } from "../utils/safe-json";
import type { AsyncStoreConfig, } from "./store";

/** Queue entry — discriminated by the status target. */
export type Write =
  | { kind: "upsert"; id: string; method: string; routePattern: string; userId: string | null; startedAt: string }
  | {
    kind: "progress";
    id: string;
    status: "pending" | "in_progress" | "complete" | "failed" | "expired";
    progress: Record<string, unknown> | null;
  }
  | { kind: "complete"; id: string; response: { status: number; headers: Record<string, string>; body: string } }
  | { kind: "fail"; id: string; error: string };

/**
 * Apply a single write to the DB. Exported for test fixtures.
 * @param database
 * @param write
 * @param cfg
 */
export async function apply(
  database: Kysely<DB>,
  write: Write,
  cfg: Required<AsyncStoreConfig>,
): Promise<void> {
  switch (write.kind) {
    case "upsert": {
      await database
        .insertInto("request_results",)
        .values({
          id: write.id,
          method: write.method,
          route_pattern: write.routePattern,
          user_id: write.userId,
          status: "pending",
          progress: null,
          response_status: null,
          response_headers: null,
          response_body: null,
          error: null,
          started_at: write.startedAt,
          completed_at: null,
          offloaded_at: null,
          offload_path: null,
        },)
        // `id` is the primary key; a duplicate track from a retried boot is a
        // no-op (we don't want to clobber an in-flight row's progress).
        .onConflict((oc,) => oc.column("id",).doNothing())
        .execute();
      return;
    }
    case "progress": {
      await database
        .updateTable("request_results",)
        .set({
          status: write.status,
          progress: write.progress === null ? null : jsonStringifyOr(write.progress,) ?? null,
        },)
        .where("id", "=", write.id,)
        .execute();
      return;
    }
    case "complete": {
      // Decide based on body length whether to inline or trust the offload
      // daemon to spill later. We always inline here; offload.ts re-evaluates
      // on its cron tick. If we want eager offload we can move the check.
      const inline = write.response.body.length <= cfg.maxInlineBytes;
      await database
        .updateTable("request_results",)
        .set({
          status: "complete",
          progress: null,
          response_status: write.response.status,
          response_headers: jsonStringifyOr(write.response.headers,) ?? null,
          response_body: inline ? write.response.body : null,
          error: null,
          completed_at: new Date().toISOString(),
        },)
        .where("id", "=", write.id,)
        .execute();
      return;
    }
    case "fail": {
      await database
        .updateTable("request_results",)
        .set({
          status: "failed",
          error: write.error,
          completed_at: new Date().toISOString(),
        },)
        .where("id", "=", write.id,)
        .execute();
      return;
    }
  }
}
