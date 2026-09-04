<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add CharacterState state machine for character_stats.character_state

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-character-core-system

## Summary

Add CharacterState enum and state machine (active, injured, unconscious, dead) to replace Generated<string> on character_stats.character_state. The 063_rpg_cognition_state.ts migration already documents these states in comments. Must create src/db/enums-core/character-state.ts with StateDef + createMachine, export from index, and update schema-core.ts to use Generated<CharacterState>.

## Analysis (2026-09-04)

App-layer change only — **no migration needed**. `character_stats.character_state` confirmed in fresh migration-run DDL as `TEXT DEFAULT 'active'`. Path: (1) `src/db/enums-core/character-state.ts` (StateDef + createMachine); (2) export from index; (3) `"CharacterStats": { "character_state": "CharacterState" }` in `COLUMN_TYPE_OVERRIDES` + `bun run db:sync-types`. No `src/db/migrations/*` change.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
