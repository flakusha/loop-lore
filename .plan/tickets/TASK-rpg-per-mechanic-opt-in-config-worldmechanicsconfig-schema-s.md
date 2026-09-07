<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: per-mechanic opt-in config (WorldMechanicsConfig schema slice)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-mechanics-governance.md

## Summary

Gap G5 (verified): opt-in is one boolean worlds.rpg_enabled (003_worlds.ts); epic-mechanics-governance.md Not Started. Implement its WorldMechanicsConfig schema slice: APPEND-ONLY migration adding per-mechanic flags (dice, checks, combat, xp, loot, quests) defaulting to current rpg_enabled value (parity), getMechanicsConfig(worldId) read path, wire dice/checks flags into chat gate. Admin/GM UI stays in governance epic. Plan doc §3.5. Epic: epic-mechanics-governance.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
