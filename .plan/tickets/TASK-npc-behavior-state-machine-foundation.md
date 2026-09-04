<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NPC Behavior State Machine Foundation

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Foundation for NPC behavior state machine - defines behavior states (idle, patrolling, pursuing, fleeing, socializing), state transitions based on internal traits and context, integration with movement system. Lays groundwork for BDI planning loop and NPC-to-NPC social interactions.

## Analysis (2026-09-04)

Pure app-layer behavior framework — **no migration needed** and no `COLUMN_TYPE_OVERRIDES`. Defines in-memory behavior states (idle/patrolling/pursuing/fleeing/socializing) with transition rules driven by `character_internal_traits` and context; no new or altered DB columns. No `src/db/migrations/*` change.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
