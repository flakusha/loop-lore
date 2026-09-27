<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit columns — `created_at` / `updated_at` for underdocumented tables

**Status:** Not Started
**Priority:** medium
**Effort:** Small (one migration, 9 tables × 2 columns + default values + backfill)
**Summary:** Append `created_at` and `updated_at` to 9 tables that the DBAudit (2026-09-25) found lacking both audit columns: `recipe_discoveries`, `travel_route_stops`, `blog_tags`, `chat_random_events`, `chat_pins`, `growth_log`, `status_effect`, `trade_history`, `nsfw_consent_state`. Backfill existing rows with `datetime('now')` defaults; non-destructive.
**Context:** DB field-audit 2026-09-25 cross-referenced every table against the audit-field baseline. The 9 tables in this ticket are either pure event/append-only logs (`growth_log`, `status_effect`, `trade_history`, `chat_random_events`), pure joins/pivot data (`chat_pins`, `blog_tags`, `travel_route_stops`, `recipe_discoveries`), or domain entities missing the baseline (`nsfw_consent_state`). Each loses operational visibility: no "last touched" timestamp, no debug-friendly row creation ordering, no diff-friendly export. Purely additive migration; existing rows get `datetime('now')` defaults rather than NULL — keeps NOT NULL semantics consistent with the rest of the schema.

## Per-table column additions

| Table | created_at | updated_at | Backfill | Notes |
|---|---|---|---|---|
| `recipe_discoveries` | add NOT NULL DEFAULT now | add NULL (event log, no updates expected) | now | currently has only `discovered_at` |
| `travel_route_stops` | add NOT NULL DEFAULT now | add NULL | now | route stop ordering |
| `blog_tags` | add NOT NULL DEFAULT now | add NULL (rarely updated) | now | pure tag pivot |
| `chat_random_events` | add NOT NULL DEFAULT now | add NULL (event log, has `expires_at`) | now | TTL-based event |
| `chat_pins` | add NOT NULL DEFAULT now | add NULL (rare re-pin) | now | pin pivot |
| `growth_log` | add NOT NULL DEFAULT now | add NULL (append-only event log) | now | has `confirmed_at` already |
| `status_effect` | add NOT NULL DEFAULT now | add NULL (temporal effect) | now | has `expires_at` already |
| `trade_history` | add NOT NULL DEFAULT now | add NULL (event log) | now | pure ledger |
| `nsfw_consent_state` | add NOT NULL DEFAULT now | add NULL (terminal state once granted/revoked) | now | has `revoked_at` already |

**Acceptance Criteria:**

- [ ] New migration file `src/db/migrations/019_audit_columns_for_underdocumented_tables.ts` exporting `up(db)` and `down(db)`.
- [ ] `up()` adds one column per `alterTable().addColumn()` per table (SQLite limitation).
- [ ] Existing rows back-filled with `datetime('now')` in the same migration.
- [ ] `down()` drops both columns in reverse order; back-fill is naturally discarded.
- [ ] `bun run db:sync-types && bun run db:sync-manifest && bun run schemas:check` green.
- [ ] `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts` green.
- [ ] `bun run check` green.

**Tags:** db, audit, migration, observability
**Related:** src/db/migrations/001_init.ts (audit baseline), .plan/tickets/TASK-019-hot-path-indexes.md (companion migration)


git issue: 9c1193f
