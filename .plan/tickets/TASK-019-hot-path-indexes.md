<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Hot-path index sweep — append-only migration 019

**Status:** open
**Priority:** medium
**Effort:** Small (one migration, 16 CREATE INDEX statements)
**Summary:** Append 16 hot-path indexes that the DBAudit (2026-09-25) flagged as missing. Purely additive `CREATE INDEX` statements; no rewrites, no column changes, no renumber. Append-only policy per `src/db/migrations/README.md`.
**Context:** DB field-audit 2026-09-25 (`db-migration-fixes` session, scout report) cross-referenced every table's hot read paths against existing indexes. 15 tables lack a covering index for at least one common lookup: notifications unread scan, world timeline feed, per-actor memory audit, GM shadow/whitenote GC + LLM gate filter, asset share listing, crafting attempt outcomes, crafting station listing, dice roll chat feed, world invite listing + GC, session listing, telemetry per-user/per-chart panels, blog author profile + comment threads, crafting recipe browser, and quest active-vs-done split. All indexes are read-path accelerators that the schema already implies via FK columns.

## Index list (one per table, ordered by domain)

- `notifications`: `idx_notifications_user_unread(user_id, read, created_at)` — unread-badge scan.
- `world_timeline_events`: `idx_world_timeline_events_world_occurred(world_id, occurred_at)` — timeline fetch.
- `memory_audit_log`: `idx_memory_audit_log_actor_created(actor_id, created_at)` — per-actor audit feed.
- `shadow_notes`: `idx_shadow_notes_chat_status(chat_id, status)` and `idx_shadow_notes_expires(expires_at)` — LLM gate + GC.
- `whitenotes`: `idx_whitenotes_chat(chat_id)` and `idx_whitenotes_expires(expires_at)` — GM view + GC.
- `asset_shares`: `idx_asset_shares_asset(asset_id)` and `idx_asset_shares_shared_by_created(shared_by_id, created_at)` — share listing.
- `crafting_attempts`: `idx_crafting_attempts_actor_world_status(actor_id, world_id, status)` — outcome feed.
- `crafting_station_instances`: `idx_crafting_station_instances_world_def(world_id, station_def_id)` — world crafting view.
- `dice_roll_history`: `idx_dice_roll_history_chat_created(chat_id, created_at)` — chat dice feed.
- `world_invites`: `idx_world_invites_world_expires(world_id, expires_at)` — invite GC + listing.
- `sessions`: `idx_sessions_user(user_id)` — session listing.
- `telemetry_events`: `idx_telemetry_events_user_created(user_id, created_at)` and `idx_telemetry_events_chat_created(chat_id, created_at)` — per-user/chart panels.
- `blog_posts`: `idx_blog_posts_author_published(author_id, published_at)` — author profile.
- `blog_comments`: `idx_blog_comments_post_created(post_id, created_at)` — comment thread.
- `crafting_recipes`: `idx_crafting_recipes_world_discipline(world_id, discipline)` — recipe browser.
- `quests`: `idx_quests_world_completed(world_id, completed_at)` — active-vs-done split.

**Acceptance Criteria:**

- [ ] New migration file `src/db/migrations/019_hot_path_indexes.ts` exporting `up(db)` and `down(db)`.
- [ ] All 16 indexes created in a single migration (one CREATE INDEX per `execute()` call; SQLite limitation).
- [ ] `down()` drops each index by name (no orphan objects).
- [ ] `bun run db:sync-types && bun run db:sync-manifest && bun run schemas:check` green.
- [ ] `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts` green (roundtrip preserves the index list).
- [ ] `bun run check` green; no renames, no renumbers, no column changes.

**Tags:** db, indexes, performance, migration
**Related:** src/db/migrations/016_item_instance_state.ts, src/db/migrations/017_asset_links_archived_at.ts, src/db/migrations/018_guard_triggers_update_twins.ts, .plan/tickets/TASK-rag-search-providers.md (search/RAG panels also exercise these paths)


git issue: 8f23860
