// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 084_lore_reveal_condition_timeline_rarity
 *
 * Lore Knowledge System (epic-lore-knowledge): three columns on both lore
 * tables (`world_lore_entries`, `actor_lore_entries`).
 *
 * - `reveal_condition` (text NULL): JSON reveal gate for secret lore. NULL or
 *   blank = not secret (always eligible, unchanged behavior). When set, the
 *   lore injection path withholds the entry until the condition is met by the
 *   live conversation or the chat's timeline events (evaluated in
 *   `src/assistant/lore/reveal-condition.ts`). Malformed JSON fails closed —
 *   the same convention as invalid regex keys in `lore-activation.ts`.
 * - `timeline_id` (text NULL): timeline scoping slug following the
 *   `chats.timeline_id` / `world_timeline_events.timeline_id` convention
 *   (timeline slug, 'prime' elsewhere). NULL = the entry exists on every
 *   timeline ("common lore available to all timelines"); a value restricts it
 *   to chats whose `chats.timeline_id` matches. Deliberately nullable,
 *   unlike `chats.timeline_id`: NULL has to mean "all timelines" — a NOT NULL
 *   'prime' default would silently strand every existing row on prime only.
 * - `rarity` (text NOT NULL DEFAULT 'common'): unified rarity tier reusing the
 *   canonical `ItemRarity` enum (common..artifact) — the same single scale
 *   items and loot already use. 'common' default keeps every pre-existing row
 *   at weight 1 under rarity-weighted selection, so existing worlds see no
 *   behavior change.
 *
 * `down()` drops the columns in reverse, restoring the exact pre-084 shape.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn("reveal_condition", "text",)
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn("timeline_id", "text",)
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn("rarity", "text", (col,) => col.notNull().defaultTo("common",),)
    .execute();

  await database.schema
    .alterTable("actor_lore_entries",)
    .addColumn("reveal_condition", "text",)
    .execute();

  await database.schema
    .alterTable("actor_lore_entries",)
    .addColumn("timeline_id", "text",)
    .execute();

  await database.schema
    .alterTable("actor_lore_entries",)
    .addColumn("rarity", "text", (col,) => col.notNull().defaultTo("common",),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actor_lore_entries",)
    .dropColumn("rarity",)
    .execute();

  await database.schema
    .alterTable("actor_lore_entries",)
    .dropColumn("timeline_id",)
    .execute();

  await database.schema
    .alterTable("actor_lore_entries",)
    .dropColumn("reveal_condition",)
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .dropColumn("rarity",)
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .dropColumn("timeline_id",)
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .dropColumn("reveal_condition",)
    .execute();
}
