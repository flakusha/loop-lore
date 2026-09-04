<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add BattleStatus state machine for battles.status

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-battle-action-systems

## Summary

Replace string-typed status in battles with BattleStatus state machine (active→paused/ended/forfeited). Must create src/db/enums-core/battle-status.ts with StateDef + createMachine, export from index, and add a `Battles.status` COLUMN_TYPE_OVERRIDES mapping (then `bun run db:sync-types`). No migration.

## Analysis (2026-09-04)

App-layer change only — **no migration needed**. `battles.status` confirmed in fresh migration-run DDL as `TEXT DEFAULT 'active'`. Path: (1) `src/db/enums-core/battle-status.ts` (StateDef + createMachine); (2) export from `enums-core` index; (3) `"Battles": { "status": "BattleStatus" }` in `COLUMN_TYPE_OVERRIDES` + `bun run db:sync-types`. No `src/db/migrations/*` change.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
