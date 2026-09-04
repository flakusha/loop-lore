<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add AppealStatus state machine for moderation_appeals.status

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-chat-lifecycle-moderation

## Summary

Replace string-typed status in moderation_appeals with AppealStatus state machine (pending→approved/denied). Must create src/db/enums-core/appeal-status.ts with StateDef + createMachine, export from index, and add a `ModerationAppeals.status` COLUMN_TYPE_OVERRIDES mapping (then `bun run db:sync-types`). No migration.

## Analysis (2026-09-04)

App-layer change only — **no migration needed**. `moderation_appeals.status` confirmed in fresh migration-run DDL as `TEXT DEFAULT 'pending'`. Path: (1) `src/db/enums-core/appeal-status.ts` (StateDef + createMachine); (2) export from `enums-core` index; (3) `"ModerationAppeals": { "status": "AppealStatus" }` in `COLUMN_TYPE_OVERRIDES` + `bun run db:sync-types`. No `src/db/migrations/*` change.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
