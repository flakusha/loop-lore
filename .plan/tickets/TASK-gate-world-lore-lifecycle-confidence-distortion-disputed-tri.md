<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Gate world_lore lifecycle confidence-distortion-disputed triple

**Status:** Not Started
**Priority:** medium
**Effort:** Small (state machine wrap + unit test)
**Epic:** epic-rpg-mechanics.md
**Summary:** `world_lore_entries` `confidence` × `distortion_level` → `disputed` (migration `005`) is computed in `assistant/lore/lifecycle.ts:isDisputed` but unwrapped at the DB boundary. Convert disputed reads to a `DisputedState` machine + `CompositeValidator` wrapping the existing resolver. Unit test. No column changes.
**Context:** DB schema-gate audit (2026-09-25, db-migration-fixes session). Builds on the merged world-lore-lifecycle work (`TASK-world-lore-lifecycle-confidence-decay-distortion`, `190a6ea9b`) — this hardens the boundary, not the logic.

**Acceptance Criteria:**
- [ ] Disputed reads go through the `DisputedState` machine (no raw unwrapped reads at the DB boundary).
- [ ] `CompositeValidator` wraps the existing `isDisputed` resolver — logic unchanged, boundary typed.
- [ ] Unit test covers the triple's valid/invalid states.
- [ ] `bun run check` green.

**Tags:** db, world-lore, validator, state-machine
**Related:** src/assistant/lore/lifecycle.ts, src/db migration 005, TASK-world-lore-lifecycle-confidence-decay-distortion


git issue: f85b585
