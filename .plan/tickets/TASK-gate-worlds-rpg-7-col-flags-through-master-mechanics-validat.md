<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Gate worlds RPG 7-col flags through master-mechanics validator

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

worlds rpg_enabled + rpg_dice/checks/combat/xp/loot/quests drift via raw Boolean() casts (src/rpg/service/world-gate.ts:41,94-99). Add CompositeValidator master=OR(mechanics), call assertValid in checkMechanicEnabled/getMechanicsConfig paths, unit test. No column changes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
