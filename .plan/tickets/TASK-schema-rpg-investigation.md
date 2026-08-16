<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-schema-rpg-investigation: Investigate orphaned RPG schema interfaces

**Status**: open
**Priority**: medium
**Labels**: cleanup, investigation
**Assignee**:
**Related**: chore(db): add auto-generators for schema types, manifest, and test helpers

## Description

`src/db/schema-rpg.ts` contains interfaces for tables that don't exist in any migration:

- `DiceRollHistory`
- `CharacterStats`
- `XpLedger`
- `LootTables`
- `LootEntries`

These tables were never created. The file is dead code (0 imports, not in barrel).

## Investigation Tasks

1. **Check specs** — were these tables planned in `docs/spec/`?
2. **Check git history** — when were these interfaces added? Were they part of a planned feature?
3. **Determine intent** — was this:
   - (a) Planned but never implemented (features like dice rolls, XP, loot)
   - (b) Abandoned concept
   - (c) Prototype that was replaced
4. **Decision** — if planned but not implemented:
   - Create corresponding migrations if still needed
   - Or document as "planned but not yet implemented" in specs

## Resolution

After investigation, either:

- **Re-add** if these features are still planned and needed
- **Delete ticket** if confirmed abandoned

## Context

Deleted in: `chore(db): add auto-generators for schema types, manifest, and test helpers`
Original file: `src/db/schema-rpg.ts` (131 lines)
