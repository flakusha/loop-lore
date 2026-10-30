// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 084_actor_memories_timeline_id
 *
 * Add `timeline_id` to `actor_memories` so memories can be bound to a
 * timeline (epic-memory-propagation: "memories don't propagate between
 * timelines by default"). Plain text, no FK: matches the
 * `world_timeline_events.timeline_id` / `chats.timeline_id` convention
 * (timeline slug, 'prime' default elsewhere).
 *
 * NULLABLE, no default — the opposite choice from 048, deliberately. Here
 * NULL is meaningful: it marks a timeline-AGNOSTIC memory, visible in every
 * timeline. It is also the explicit cross-timeline sharing exception
 * ("GM-created lore or rare events can seed knowledge across timelines").
 * Backfilling existing rows to 'prime' would silently confine every memory
 * extracted before this migration to the 'prime' timeline, hiding them in
 * forked timelines; leaving them NULL preserves their visibility exactly.
 * New rows are bound at extraction time (`storeMemories` resolves the source
 * chat's `chats.timeline_id`) — extraction without a resolvable chat row
 * stores NULL rather than guessing.
 *
 * `down()` drops the column, restoring the exact pre-084 shape for every
 * row — the binding is fully reverted.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actor_memories",)
    .addColumn("timeline_id", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("actor_memories",).dropColumn("timeline_id",).execute();
}
