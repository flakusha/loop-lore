<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add BattleStatus state machine for battles.status

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-battle-action-systems

## Summary

Replace string-typed status in battles with BattleStatus state machine (active→paused/ended/forfeited). The 062_battles.ts migration adds status defaulting to 'active'. Must create src/db/enums-core/battle-status.ts with StateDef + createMachine, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
