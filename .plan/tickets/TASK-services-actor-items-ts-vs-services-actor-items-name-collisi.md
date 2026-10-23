<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: services/actor-items.ts vs services/actor-items/ name collision

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-items

**Summary:**

src/services/ contains both a file actor-items.ts and a directory actor-items/ with the same base name. Module resolution picks the file, and the directory has no index.ts, so callers reach the split modules by pathing into services/actor-items/{transfer,equip,affordance} directly. A third parallel implementation existed in the now-deleted src/actors/actor-items.ts (removed on fix-knip-src-blindspot with the dead src/actors/ layer). Consolidate the naming: one canonical actor-items home, callers migrated, no same-name file/dir siblings left in src/services/.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
