<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Content versioning for heavy-text tables — extend `data_version`/`record_hash`

**Status:** open
**Priority:** medium
**Effort:** Medium (one migration + opt-in `registerContentVersion` calls in 7 services)
**Summary:** Extend the existing `data_version` + `record_hash` pattern (already on `assets`, `characters`, `chats`, `messages`, `worlds`, `actors`) to 7 additional content-heavy tables: `items`, `world_lore_entries`, `actor_lore_entries`, `quests`, `locations`, `blog_posts`, `shadow_notes`, `whitenotes`, `crafting_recipes`. Schema-only adds; the `registerContentVersion` hookup is opt-in per service to avoid breaking existing writers.
**Context:** DB field-audit 2026-09-25 found that user-edited or LLM-derived content tables lack tamper-detection digests and stable version tracking for export/import diff. The infrastructure already exists: `src/db/content-version.ts` provides `registerContentVersion`, `getContentEnvelope`, `computeRowHash`, `runBatchRefresh`. Migrations 002-006 added `data_version` columns to a small set of tables; this ticket extends the pattern systematically. Purely additive; existing rows default to `data_version=0` and `record_hash=""` until the owning service calls `runBatchRefresh` once. The registry hookup lives in service code so each domain can stage rollout independently.

## Per-table additions

| Table | data_version | record_hash | Notes |
|---|---|---|---|
| `items` | NOT NULL DEFAULT 0 | NOT NULL DEFAULT "" | per-world item definitions; LLM-generated |
| `world_lore_entries` | NOT NULL DEFAULT 0 | NOT NULL DEFAULT "" | lifecycle-aware content (005/018) |
| `actor_lore_entries` | NOT NULL DEFAULT 0 | NOT NULL DEFAULT "" | mirrors world_lore_entries |
| `quests` | NOT NULL DEFAULT 0 | NOT NULL DEFAULT "" | per-world quest definitions |
| `locations` | NOT NULL DEFAULT 0 | NOT NULL DEFAULT "" | world location graph |
| `blog_posts` | NOT NULL DEFAULT 0 | NOT NULL DEFAULT "" | published content |
| `shadow_notes` | NOT NULL DEFAULT 0 | NOT NULL DEFAULT "" | GM tool — content integrity matters |
| `whitenotes` | NOT NULL DEFAULT 0 | NOT NULL DEFAULT "" | GM tool — content integrity matters |
| `crafting_recipes` | NOT NULL DEFAULT 0 | NOT NULL DEFAULT "" | import/export diffs |

**Acceptance Criteria:**

- [ ] New migration file `src/db/migrations/019_content_versioning_on_heavy_tables.ts` exporting `up(db)` and `down(db)`.
- [ ] `up()` adds `data_version INTEGER NOT NULL DEFAULT 0` and `record_hash TEXT NOT NULL DEFAULT ""` to each of the 9 tables (one column per `alterTable().addColumn()`).
- [ ] `down()` drops both columns in reverse order.
- [ ] At least one service per table calls `registerContentVersion(table, 0, [...])` declaring the projection columns (deferred sub-tasks per service to wire `runBatchRefresh` into writes).
- [ ] `bun run db:sync-types && bun run db:sync-manifest && bun run schemas:check` green.
- [ ] `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts src/db/content-version.test.ts` green.
- [ ] `bun run check` green.

**Tags:** db, content-versioning, integrity, migration
**Related:** src/db/content-version.ts, src/db/migrations/018_guard_triggers_update_twins.ts, .plan/tickets/TASK-019-audit-columns.md (companion migration), .plan/tickets/TASK-db-content-versioning.md, .plan/tickets/TASK-content-hash-consistency.md


git issue: f9f5b1c
