// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 072 — Unique (message_id, actor_id) on message_seen
 *
 * Enables safe upsert via `INSERT ... ON CONFLICT (message_id, actor_id)
 * DO UPDATE SET ...`. The deterministic PK `ms-<msgId>-<actorId>` already
 * prevents duplicates at write time but races on the select-then-insert
 * sequence (BUG-bug-message-seen-post-races-on-deterministic-primary-key-500).
 *
 * Adding this index activates the `onConflict(columns(["message_id",
 * "actor_id"]))` upsert in both `src/routes/message-seen.ts#POST` and
 * `src/chat/service/seen.ts#recordMessageSeen`. Prior to this index,
 * `onConflict(columns)` had no conflict target — it silently degraded
 * to a plain INSERT, allowing duplicate rows to accumulate. The
 * deterministic PK `ms-<msgId>-<actorId>` would have caught them but
 * only if every writer used it; the route layer was racing on a
 * select-then-insert sequence instead (see
 * BUG-bug-message-seen-post-races-on-deterministic-primary-key-500).
 *
 * Rollout caveat: any environment that bypassed the deterministic PK
 * (manual SQL or pre-070 recovery) will fail this `CREATE UNIQUE INDEX`
 * with "UNIQUE constraint failed" — verify with
 * `SELECT message_id, actor_id, COUNT(*) FROM message_seen
 *  GROUP BY 1,2 HAVING COUNT(*) > 1;` before deploying.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createIndex("idx_message_seen_message_actor_unique",)
    .on("message_seen",)
    .columns(["message_id", "actor_id",],)
    .unique()
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_message_seen_message_actor_unique",).execute();
}
