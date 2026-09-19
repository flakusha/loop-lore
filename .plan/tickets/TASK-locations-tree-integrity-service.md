<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Location Tree Integrity Service

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** locations, tree, validation, recursive-cte, service

**Summary:** Service layer over the new locations table providing recursive helpers (getAncestors, getDescendants, getPath, getDepth, getRoot, getSubtreeSize, isAncestor) via SQLite recursive CTE; wraps trigger guards (cycle, cross-world, depth) in a fail-fast application layer.
**Context:** The DB triggers reject bad data, but application code still needs to query the tree and validate writes before hitting the trigger path. This service is the single read/write surface for location hierarchy.
**Acceptance Criteria:** See acceptance checklist below.

## Summary

Service layer over the new `locations` table providing **recursive helpers** for
the fractal model: `getAncestors(id)`, `getDescendants(id)`,
`getPath(id)`, `getDepth(id)`, `getRoot(id)`, `getSubtreeSize(id)`,
`isAncestor(ancestorId, descendantId)`. All implemented via recursive CTE
on SQLite so the DB does the recursion. Wraps the trigger-level guards
(cycle, cross-world, depth) in a **fail-fast application layer** so unit
tests can exercise every invariant without hitting the DB trigger path
on every call.

## Acceptance Criteria

- [ ] New file `src/rpg/location-tree/service.ts` with the helpers above.
- [ ] Each helper exported as a typed function with explicit return shape
      (no `any`).
- [ ] `getDescendants` accepts an optional `kind` filter (e.g. only
      `LocationKind.Room` inside a ship).
- [ ] `validateNesting(parentId, childId)` runs the four guards:
      (a) self-parent, (b) cycle, (c) cross-world, (d) depth ≤ 12. Returns
      `{ ok: true } | { ok: false; code: 'self' | 'cycle' | 'cross_world' |
      'depth'; detail: string }`.
- [ ] Recursive CTE uses the `idx_locations_path` index (verified via
      `EXPLAIN QUERY PLAN` in a test).
- [ ] Tests in `src/rpg/location-tree/service.test.ts`:
      - `getAncestors` on a 3-level chain.
      - `getDescendants` returns correct subtree with `kind` filter.
      - `validateNesting` returns each error code (one test per case).
      - `isAncestor` true + false.
      - Cycle guard: insert A, then try to set `A.parent = B, B.parent = A`
        — must error before any DB write.

## Out of Scope

- UI rendering of the tree.
- API endpoints (covered by `TASK-fractal-locations-api-routes.md`).

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
