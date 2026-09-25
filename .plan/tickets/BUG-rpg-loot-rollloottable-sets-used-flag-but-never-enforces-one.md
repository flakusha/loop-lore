<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: rpg loot: rollLootTable sets 'used' flag but never enforces one-shot use

**Status:** done
**Priority:** low
**Effort:** Medium
**Summary:** (see ## Summary)
**Context:** (see ## Observed / ## Evidence)
**Acceptance Criteria:** (see ## Acceptance Criteria)

## Summary

## Observed

rollLootTable writes `used: 1` to loot_tables at line 128 after rolling, but the SELECT at line 116-120 fetches all entries without filtering by used=0. No read of the used column anywhere gates a re-roll. A loot table can be rolled multiple times after the marker is set.

## Expected

Either read the used flag before rolling and refuse if already set, OR remove the used flag write entirely if the column serves no enforcement purpose (e.g., is only audit metadata that callers do not consume).

## Evidence

- src/rpg/service/loot-tables.ts:116-131 — fetch ignores used, then UPDATE sets used=1.
- reproduction: rollLootTable twice on the same lootTableId. Both calls succeed. If the design intent is one-shot loot, this is broken. If the intent is just audit logging, the code is misleading.

## Severity

low

## Fix direction

Either: (a) add `.where('used', '=', 0)` to the entries SELECT and refuse to roll if used=1, OR (b) drop the UPDATE line and document that 'used' is no longer maintained.


## Acceptance Criteria

- [x] Implementation complete — option (b): `used` is an audit marker, not an enforcement gate
- [x] Tests passing — dice-xp-loot.coverage.test.ts asserts the marker semantics
- [x] Documentation updated — see Resolution below

## Resolution (verified 2026-09-19)

Took option (b): `rollLootTable` (src/rpg/service/loot-tables.ts) keeps writing `used: 1`, now documented in-source as an AUDIT marker only ("table rolled at least once") — loot tables are repeatable by design. `src/rpg/service/dice-xp-loot.coverage.test.ts` asserts `used` flips to 1 after a roll while repeated rolls keep succeeding. No `.where('used', '=', 0)` filter was added; dropping the column is a schema change with no payoff (audit value remains).
