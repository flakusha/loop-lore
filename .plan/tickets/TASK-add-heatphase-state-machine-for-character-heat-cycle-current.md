<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add HeatPhase state machine for character_heat_cycle.current_phase

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-character-core-system

## Summary

Replace string-typed current_phase in character_heat_cycle with HeatPhase state machine (normal→heat→cooling). The 012_features.ts migration defaults to 'normal'. Must create src/db/enums-core/heat-phase.ts with StateDef + createMachine, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
