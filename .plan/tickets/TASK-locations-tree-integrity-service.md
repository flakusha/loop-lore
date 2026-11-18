<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Location Tree Integrity Service

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Duplicate of:** TASK-location-tree-integrity-service (kept — git-issue parity; status mirrored 2026-10-23)
**Tags:** locations, tree, validation, recursive-cte, service

**Summary:** `LocationTreeService` in `src/locations/tree.ts:77-300` ships typed recursive CTE helpers (getAncestors/getDescendants), path repair, depth-checked insert, cycle/cross-world-checked subtree move and a `tree()` that emits real `path`, numeric `depth` and the transport fields per the fixed UI contract.
**Context:** DB triggers guard INSERT-time self-parent/cross-world and maintain `path`; cycle and the depth ceiling are app-layer in this service. It is the single read/write surface for location hierarchy, used by world routes and the UI tree.
**Acceptance Criteria:** See acceptance checklist below.

## Summary

`LocationTreeService` (`src/locations/tree.ts:77-300`) is shipped:

| Capability | Location |
| ---------- | -------- |
| `computeChildPath` / `depth` helpers | `tree.ts:90-105` |
| `insertLocation` — parent existence, cross-world + depth (`LOCATION_DEPTH_LIMIT`) checks | `tree.ts:113-146` |
| `repairPath` — idempotent single-row path repair | `tree.ts:153-186` |
| `getAncestors` — recursive CTE, root-most first | `tree.ts:184-199` |
| `getDescendants` — recursive CTE, breadth-first | `tree.ts:206-221` |
| `tree(worldId)` — real path + separator-count depth + kind/mobility/route/progress | `tree.ts:230-262` (projection :238, depth :256) |
| `moveSubtree` — self-parent / not-found / cross-world / cycle rejection | `tree.ts:270-299` |

The DB layer (`001_init.ts:4121-4184`) enforces self-parent and cross-world on INSERT and maintains `path` on INSERT/parent UPDATE. Cycle rejection and depth 12 are **app-layer only** (`tree.ts:113-146`, `:270-299`; `LOCATION_DEPTH_LIMIT` at `src/db/enums-story/world.ts:168`) — no `trg_locations_no_cycle` / `trg_locations_depth_limit` triggers exist in `001_init.ts`. The four triggers in `106_locations_integrity.ts:20-71` close the UPDATE/depth DB gap; the service checks stay authoritative for pre-trigger validation paths.

**Cross-task contract (shipped):** `tree()` loads real `path`, `kind`, `mobility_mode`, `current_route_id` and `travel_progress` (`tree.ts:238`) and computes `depth` as path separators minus 1 (`:256`), so UI tasks D1/D2 render against the real tree. Tests live in `src/locations/tree.test.ts`.

## Acceptance Criteria

- [x] Implementation in `src/locations/tree.ts` (not `src/rpg/location-tree/`).
- [x] Typed exports, no `any` (`LocationTreeNode`, `LocationTreeBranch`, `InsertLocationInput`, `LocationMoveError`).
- [x] `getAncestors` / `getDescendants` via recursive CTE (`tree.ts:184-221`).
- [x] `insertLocation` enforces cross-world + depth <= 12 at the app layer (`tree.ts:113-146`).
- [x] `moveSubtree` rejects self-parent, not-found, cross-world and cycle (`tree.ts:270-299`).
- [x] Tests in `src/locations/tree.test.ts` cover ancestors, descendants, path repair and the move guards.
- [x] `tree()` rows carry real `path`, numeric `depth`, `kind`, `mobility_mode`, `current_route_id`, `travel_progress` (`tree.ts:230-262`).

## Out of Scope

- UI rendering of the tree.
- API endpoints (covered by `TASK-fractal-locations-api-routes.md`).

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
- `src/locations/tree.ts` (service implementation)
- `src/locations/tree.test.ts` (tests)

## Verification Notes (2026-11-18)

- `src/locations/tree.ts` read directly at :90-105 (path/depth helpers), :113-146 (depth-checked insert), :153-186 (path repair), :184-221 (recursive CTEs), :230-262 (`tree()`), :270-299 (move guards).
- `tree()` projection at :238 includes `path`, `kind`, `mobility_mode`, `current_route_id`, `travel_progress`; `depth` computed at :256 as path separators minus 1.
- `LOCATION_DEPTH_LIMIT` at `src/db/enums-story/world.ts:168`; cycle/depth are app-layer, no such triggers in `001_init.ts`.
- Behavior covered by `src/locations/tree.test.ts`.
