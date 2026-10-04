<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Gate worlds RPG 7-col flags through master-mechanics validator

**Status:** Not Started
**Priority:** medium
**Effort:** Small (composite validator + call-site wiring + unit test)
**Summary:** `worlds` `rpg_enabled` + `rpg_dice`/`rpg_checks`/`rpg_combat`/`rpg_xp`/`rpg_loot`/`rpg_quests` drift via raw `Boolean()` casts (`src/rpg/service/world-gate.ts:41,94-99`). Add a `CompositeValidator` with master=`OR(mechanics)` semantics; call `assertValid` in the `checkMechanicEnabled`/`getMechanicsConfig` paths. Unit test. No column changes.
**Context:** DB schema-gate audit (2026-09-25, db-migration-fixes session). Individual mechanic flags can be true while the master gate is false (or vice versa) with no validation; the composite makes the invariant executable.

**Acceptance Criteria:**
- [ ] `CompositeValidator` enforces master=`OR(mechanics)` across the 7 columns.
- [ ] `checkMechanicEnabled` + `getMechanicsConfig` call `assertValid` before reading flags.
- [ ] Unit test covers master-only, mechanic-without-master (invalid), and all-off states.
- [ ] `bun run check` green.

**Tags:** db, rpg, validator, world-gate
**Related:** src/rpg/service/world-gate.ts


git issue: 9678610
