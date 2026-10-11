<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: NPC migration with deleted destination leaves NPC stuck at origin

**Status:** Not Started
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
