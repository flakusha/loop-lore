<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: buildSkillTree silently drops orphan nodes

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-rpg-progression

**Summary:**

When a skill has prerequisites that reference skill IDs not present in the actor's skill list, the node (src/rpg/skills/service/tree.ts:72-88) is never added to roots and never attached to any parent. It silently disappears. Impact: Skills with stale/wrong prerequisite references vanish from the tree UI with no explanation. Fix: After the loop, collect nodes with no parent and either push them to roots or log a warning.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
