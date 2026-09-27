<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Watchdog Events Table + Telemetry Sink

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** watchdog, telemetry, kysely, migration, audit
**Epic:** epic-recursive-self-improvement

Kysely migration for `watchdog_events` table; sink that records every state transition + crash. Admin surface `GET /api/admin/watchdog` reads from it.

## Core Features

- Migration `NNN_rsi_watchdog_events.ts` (append-only; check next sequential number):
  ```sql
  CREATE TABLE watchdog_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state TEXT NOT NULL,
    child_pid INTEGER,
    exit_code INTEGER,
    signal TEXT,
    uptime_ms INTEGER,
    failure_count INTEGER,
    message TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_watchdog_events_created_at ON watchdog_events(created_at DESC);
  ```
- Sink `src/server/watchdog/events.ts` — writes to table + logger
- Admin route `GET /api/admin/watchdog` — returns last 100 events + current state

## Acceptance Criteria

- [ ] Migration applies + reverses cleanly (`bun run db:migrate` + `bun run db:migrate down`)
- [ ] Every state transition from #2 lands as a row in `watchdog_events`
- [ ] `GET /api/admin/watchdog` returns last 100 events ordered by `created_at DESC` (admin-scoped)
- [ ] Schema regen picks up the new table (`bun run db:sync-schema`)
- [ ] Migration test passes (covered by `src/db/migrations.test.ts`)

## Files

- `src/db/migrations/NNN_rsi_watchdog_events.ts` — new (check next number)
- `src/server/watchdog/events.ts` — new
- `src/routes/admin/watchdog.ts` — new (or extend existing admin routes)
- `src/server/watchdog/events.test.ts` — new

## Notes / Verification

- Append-only policy per `AGENTS.md`: never edit existing migrations; only add new ones.
- Reuse `src/db/column-types.ts` for any text-enum columns.
- Generated artifacts `src/db/schema-*.ts`, `src/db/schema.ts`, `src/validation/db-schemas.ts` regenerate automatically.

