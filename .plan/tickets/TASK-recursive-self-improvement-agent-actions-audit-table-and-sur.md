<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Agent Actions Audit Table + Surface

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
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

- [ ] Migration applies + reverses cleanly
- [ ] Every agent API call lands a row (success or fail)
- [ ] Token hash stored as SHA-256 prefix only (first 16 chars); no plaintext
- [ ] Admin route paginates and filters correctly
- [ ] Schema regen picks up the new table

## Files

- `src/db/migrations/NNN_rsi_agent_actions.ts` — new
- `src/agent/audit.ts` — new (sink)
- `src/routes/admin/agent-actions.ts` — new
- `src/agent/audit.test.ts` — new

## Notes / Verification

- Same append-only migration pattern as #4.
- Reuse `src/notifications/` event bus for fire-and-forget audit emissions.

