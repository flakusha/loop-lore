// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 035_hot_path_indexes
 *
 * Read-path index sweep from the DB field-audit (2026-09-25). Every index
 * here accelerates a lookup the schema already implies via existing columns;
 * no table, column, or constraint is rewritten.
 *
 * Six of the audited indexes are already present under another name and are
 * therefore NOT recreated here. A same-column index under a second name is
 * pure write overhead with no planner benefit, and SQLite rejects a duplicate
 * index name outright, so re-creating any of these would abort the migration:
 *
 *   - `idx_asset_shares_asset(asset_id)` — already in 001_init.
 *   - `idx_sessions_user(user_id)` — already exists as
 *     `idx_sessions_user_id(user_id)`.
 *   - `idx_notifications_user_unread(user_id, read, created_at)` — already
 *     exists as `idx_notifications_user_read` with identical columns.
 *   - `idx_whitenotes_chat(chat_id)` — already exists as
 *     `idx_whitenotes_chat_id(chat_id)`.
 *   - `idx_world_timeline_events_world_occurred(world_id, occurred_at)` —
 *     already exists as `world_timeline_events_world_occurred_idx`.
 *   - `idx_memory_audit_log_actor_created(actor_id, created_at)` — already
 *     exists as `idx_memory_audit_log_actor`.
 *
 * `idx_shadow_notes_expires(expires_at)` IS created even though 004 already
 * added `idx_shadow_notes_expires_at`: that one is PARTIAL (`WHERE expires_at
 * IS NOT NULL`) and the GC query filters with `expires_at IS NULL OR expires_at
 * > ?`, so the partial index cannot serve it.
 *
 * `down()` drops each index this migration creates, in reverse order.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  // LLM gate + GC.
  await database.schema
    .createIndex("idx_shadow_notes_chat_status",)
    .on("shadow_notes",)
    .columns(["chat_id", "status",],)
    .execute();
  await database.schema
    .createIndex("idx_shadow_notes_expires",)
    .on("shadow_notes",)
    .columns(["expires_at",],)
    .execute();

  // GM view + GC.
  await database.schema
    .createIndex("idx_whitenotes_expires",)
    .on("whitenotes",)
    .columns(["expires_at",],)
    .execute();

  // Share listing (the `asset_shares_asset` half already exists from 001_init).
  await database.schema
    .createIndex("idx_asset_shares_shared_by_created",)
    .on("asset_shares",)
    .columns(["shared_by_id", "created_at",],)
    .execute();

  // Outcome feed.
  await database.schema
    .createIndex("idx_crafting_attempts_actor_world_status",)
    .on("crafting_attempts",)
    .columns(["actor_id", "world_id", "status",],)
    .execute();

  // World crafting view.
  await database.schema
    .createIndex("idx_crafting_station_instances_world_def",)
    .on("crafting_station_instances",)
    .columns(["world_id", "station_def_id",],)
    .execute();

  // Chat dice feed.
  await database.schema
    .createIndex("idx_dice_roll_history_chat_created",)
    .on("dice_roll_history",)
    .columns(["chat_id", "created_at",],)
    .execute();

  // Invite GC + listing.
  await database.schema
    .createIndex("idx_world_invites_world_expires",)
    .on("world_invites",)
    .columns(["world_id", "expires_at",],)
    .execute();

  // Per-user / per-chart telemetry panels.
  await database.schema
    .createIndex("idx_telemetry_events_user_created",)
    .on("telemetry_events",)
    .columns(["user_id", "created_at",],)
    .execute();
  await database.schema
    .createIndex("idx_telemetry_events_chat_created",)
    .on("telemetry_events",)
    .columns(["chat_id", "created_at",],)
    .execute();

  // Author profile.
  await database.schema
    .createIndex("idx_blog_posts_author_published",)
    .on("blog_posts",)
    .columns(["author_id", "published_at",],)
    .execute();

  // Comment thread.
  await database.schema
    .createIndex("idx_blog_comments_post_created",)
    .on("blog_comments",)
    .columns(["post_id", "created_at",],)
    .execute();

  // Recipe browser.
  await database.schema
    .createIndex("idx_crafting_recipes_world_discipline",)
    .on("crafting_recipes",)
    .columns(["world_id", "discipline",],)
    .execute();

  // Active-vs-done quest split.
  await database.schema
    .createIndex("idx_quests_world_completed",)
    .on("quests",)
    .columns(["world_id", "completed_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_quests_world_completed",).execute();
  await database.schema.dropIndex("idx_crafting_recipes_world_discipline",).execute();
  await database.schema.dropIndex("idx_blog_comments_post_created",).execute();
  await database.schema.dropIndex("idx_blog_posts_author_published",).execute();
  await database.schema.dropIndex("idx_telemetry_events_chat_created",).execute();
  await database.schema.dropIndex("idx_telemetry_events_user_created",).execute();
  await database.schema.dropIndex("idx_world_invites_world_expires",).execute();
  await database.schema.dropIndex("idx_dice_roll_history_chat_created",).execute();
  await database.schema.dropIndex("idx_crafting_station_instances_world_def",).execute();
  await database.schema.dropIndex("idx_crafting_attempts_actor_world_status",).execute();
  await database.schema.dropIndex("idx_asset_shares_shared_by_created",).execute();
  await database.schema.dropIndex("idx_whitenotes_expires",).execute();
  await database.schema.dropIndex("idx_shadow_notes_expires",).execute();
  await database.schema.dropIndex("idx_shadow_notes_chat_status",).execute();
}
