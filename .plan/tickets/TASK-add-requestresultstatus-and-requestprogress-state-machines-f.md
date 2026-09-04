<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add RequestResultStatus and RequestProgress state machines for request_results

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-middleware-request-lifecycle

## Summary

Replace string-typed status/progress fields in request_results table with strictly typed state machines. RequestResultStatus: pending→in_progress→complete/failed/expired. RequestProgress: waiting→processing→paused→done. Must create src/db/enums-core/request-result.ts with StateDef + createMachine + CompositeValidator, export from index, and add `RequestResults` status/progress COLUMN_TYPE_OVERRIDES mappings (then `bun run db:sync-types`). No migration.

## Analysis (2026-09-04)

App-layer change only — **no migration needed**. `request_results.status` and `.progress` confirmed in fresh DDL as nullable `TEXT` (no default). Path: (1) `src/db/enums-core/request-result.ts` (StateDef + createMachine + CompositeValidator); (2) export from index; (3) `"RequestResults": { "status": "RequestResultStatus", "progress": "RequestProgress" }` in `COLUMN_TYPE_OVERRIDES` + `bun run db:sync-types`. No `src/db/migrations/*` change.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
