<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Location tree integrity service

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** locations, tree, validation, recursive-cte, service

**Summary:** Service layer over the new locations table providing recursive helpers (getAncestors, getDescendants, getPath, getDepth, getRoot, getSubtreeSize, isAncestor) via SQLite recursive CTE; wraps trigger guards. Full details in TASK-locations-tree-integrity-service.md.
**Context:** DB triggers reject bad data; application code still needs to query the tree and validate writes before hitting the trigger path.
**Acceptance Criteria:** See TASK-locations-tree-integrity-service.md.

## Summary

Recursive helpers (getAncestors, getDescendants, getPath, getDepth, validateNesting) over the new locations columns; fail-fast app layer wrapping the trigger guards. See .plan/tickets/TASK-locations-tree-integrity-service.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
