<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NPC migration with deleted destination leaves NPC stuck at origin

**Status:** Done
**Priority:** medium
**Effort:** Medium

**Summary:**

When a migration's destination_location_id is null (location deleted), the migration (src/rpg/world-travel/migration.ts:97-101) is marked arrived but npc_states.location_id is never updated. The NPC remains at the origin location forever. Impact: An NPC whose destination location was deleted is permanently stuck at its origin. Fix: Either delete the NPC state row, or move the NPC to a fallback location.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-22 registry-driven close: git issue e70009f (registry tip: 475bb2112 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-NPC-MIGRATION-WITH-DELETED-D)
