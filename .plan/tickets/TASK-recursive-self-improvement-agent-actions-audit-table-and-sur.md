<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Agent Actions Audit Table + Surface

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Done (landed on dev: `8a3a48cd3` + `440f016e1` changelog fix; 388 pass / 0 fail, 4 piecemeal gates green)
**Priority:** Medium
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** agent, audit, kysely, migration, telemetry
**Epic:** epic-recursive-self-improvement

Kysely migration for `agent_actions` table; record every agent API call. Admin surface `GET /api/admin/agent-actions` reads from it.

## Core Features

- Migration `NNN_rsi_agent_actions.ts` (append-only):

  ```sql
  CREATE TABLE agent_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,
    worktree_id TEXT,
    commit_hash TEXT,
    result TEXT NOT NULL,
    duration_ms INTEGER,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_agent_actions_created_at ON agent_actions(created_at DESC);
  CREATE INDEX idx_agent_actions_token_hash ON agent_actions(token_hash);
  ```

- Sink writes from every agent API handler
- Admin route `GET /api/admin/agent-actions?token=&action=&limit=` (admin-scoped, paginated)

## Acceptance Criteria

- [x] Migration applies + reverses cleanly (`116_rsi_agent_actions.ts`; migration + roundtrip suites green)
- [x] Every agent API call lands a row (success or fail) (choke-point writes + `onAfterHandle`/`onError` finalizers in `src/agent/api/router.ts`)
- [x] Token hash stored as SHA-256 prefix only (first 16 chars); no plaintext (column named `token_digest` — `token_hash` breaks the migration-rename-upgrade gate per empirical probe; asserted in `agent-actions.test.ts:88-97`)
- [x] Admin route paginates and filters correctly (`GET /api/v1/admin/agent-actions`, token/action filters, 50 default / 200 cap; 401/403 asserted)
- [x] Schema regen picks up the new table (generated schema/manifest/insert-helper/db-schema/fuzz artifacts in the landing commit)

## Files

- `src/db/migrations/NNN_rsi_agent_actions.ts` — new
- `src/agent/audit.ts` — new (sink)
- `src/routes/admin/agent-actions.ts` — new
- `src/agent/audit.test.ts` — new

## Notes / Verification

- Same append-only migration pattern as #4.
- Reuse `src/notifications/` event bus for fire-and-forget audit emissions.

