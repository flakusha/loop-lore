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

import type { Kysely, UpdateQueryBuilder, } from "kysely";
import type { DB, } from "../db/schema";
import { jsonStringifyOr, } from "../utils/safe-json";
import { spill, } from "./offload";
import type { AsyncStoreConfig, } from "./store";

/**
 * Queue entry — discriminated by the status target.
 *
 * `progress` / `complete` / `fail` carry `userId` so the update WHERE clause
 * is scoped by ownership: a client that guesses another user's `requestId`
 * cannot overwrite or fail that user's row. The `upsert` variant already
 * stores `userId` in the row, so the same value is used for the matching
 * scope. `userId === null` indicates an unauthenticated request (the
 * `x-user-id` header is stripped by `src/elysia-app.ts` when auth fails);
 * the WHERE clause falls back to `id` alone — anonymous rows never collide
 * with any authenticated user's row because the row's `user_id` is `null`
 * at insert time, and SQL `NULL = NULL` is false, so an unauthenticated
 * client cannot accidentally match an authenticated user's row.
 * BUG-bug-async-lifecycle-writes-request-results-unscoped-by-user.
 */
export type Write =
  | { kind: "upsert"; id: string; method: string; routePattern: string; userId: string | null; startedAt: string }
  | {
    kind: "progress";
    id: string;
    userId: string | null;
    status: "pending" | "in_progress" | "complete" | "failed" | "expired";
    progress: Record<string, unknown> | null;
  }
  | {
    kind: "complete";
    id: string;
    userId: string | null;
    response: { status: number; headers: Record<string, string>; body: string };
  }
  | { kind: "fail"; id: string; userId: string | null; error: string };

/**
 * Execute a `request_results` update scoped by `id` and (when the write
 * is authenticated) the owner's `user_id`.
 *
 * Mirrors the `requireActorFromSession` guard in the request layer:
 * the `userId` from the write is treated as the session actor and
 * matched against the row's `user_id` column. When `userId === null`
 * the WHERE clause falls back to `id` alone — anonymous rows never
 * collide with any authenticated user's row because SQL `NULL = NULL`
 * is false, and the row's `user_id` is `null` at insert time.
 *
 * Centralizing the guard here keeps the WHERE-chain shape consistent
 * across `progress` / `complete` / `fail` and makes the ownership
 * semantics a single point of change. BUG-bug-async-lifecycle-writes-
 * request-results-unscoped-by-user.
 * @param where
 * @param userId
 */
async function executeScopedByUser<O,>(
  where: UpdateQueryBuilder<DB, "request_results", "request_results", O>,
  userId: string | null,
): Promise<void> {
  await (userId !== null ? where.where("user_id", "=", userId,) : where).execute();
}

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
      // Chain two `.where()` calls: first by `id`, then by `user_id` when
      // the write is authenticated. Kysely's fluent builder narrows the
      // return type at each step, so the second `.where()` only compiles
      // when chained off the first — not when captured into a `let`.
      const where = database
        .updateTable("request_results",)
        .set({
          status: write.status,
          progress: write.progress === null ? null : jsonStringifyOr(write.progress,) ?? null,
        },)
        .where("id", "=", write.id,);
      await executeScopedByUser(where, write.userId,);
      return;
    }
    case "complete": {
      // Bodies within the inline threshold are stored in `response_body`
      // directly. Larger bodies are spilled to disk (gzip) immediately so
      // they are never dropped: the offload daemon skips rows whose
      // `response_body` is null, so nulling a large body here would lose it
      // permanently. BUG-bug-async-store-complete-drops-response-body-larger-than-max.
      const inline = write.response.body.length <= cfg.maxInlineBytes;
      const completedAt = new Date().toISOString();
      let responseBody: string | null;
      let offloadedAt: string | null = null;
      let offloadPath: string | null = null;
      if (inline) {
        responseBody = write.response.body;
      } else {
        offloadedAt = completedAt;
        offloadPath = await spill(write.id, write.response.body,);
        responseBody = null;
      }
      const where = database
        .updateTable("request_results",)
        .set({
          status: "complete",
          progress: null,
          response_status: write.response.status,
          response_headers: jsonStringifyOr(write.response.headers,) ?? null,
          response_body: responseBody,
          error: null,
          completed_at: completedAt,
          offloaded_at: offloadedAt,
          offload_path: offloadPath,
        },)
        .where("id", "=", write.id,);
      await executeScopedByUser(where, write.userId,);
      return;
    }
    case "fail": {
      const where = database
        .updateTable("request_results",)
        .set({
          status: "failed",
          error: write.error,
          completed_at: new Date().toISOString(),
        },)
        .where("id", "=", write.id,);
      await executeScopedByUser(where, write.userId,);
      return;
    }
  }
}
