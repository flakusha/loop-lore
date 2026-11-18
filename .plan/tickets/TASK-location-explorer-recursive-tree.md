<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Location Explorer — Recursive Tree + Transport Badge

**Status:** Done
**Status Note:** 2026-11-18 reconciliation: recursive depth-agnostic renderer, kind filter chips, transport badge and their tests all shipped by this lane. The renderer lives in `src/frontend/alpine/fractal-locations.ts` (Fractal tab), not in `location-explorer.ts` as the original ticket assumed; see Caveats.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-fractal-locations
**Related:** TASK-location-explorer-recursive-tree-transport-badge (duplicate pair)
**Tags:** ui, alpine, location-explorer, tree, transport

**Summary:** `renderTreeMarkup(nodes, meta, filterKind)` at `src/frontend/alpine/fractal-locations.ts:66-77` is a recursive, depth-agnostic walker; `formatTransportBadge` at `:53-60` shows route name · progress % · ETA. Chips from `src/frontend/alpine/location-explorer-controls.ts:18-31` are wired at `src/views/world-edit.html:903-922`. Tests: `src/frontend/alpine/fractal-locations.test.ts:152-185`.
**Context:** The old Explore tab stayed a flat list; the fractal hierarchy is now visible in a separate Fractal tab on the world-edit page, backed by `LocationTreeService.tree()` (`src/locations/tree.ts:230-262`).
**Acceptance Criteria:** See acceptance checklist below.

## Summary (shipped evidence)

| Deliverable | Shipped at |
| ----------- | ---------- |
| Recursive renderer with depth-agnostic `walk`, indentation and expand/collapse | `src/frontend/alpine/fractal-locations.ts:62-77` (native `<details>`, `padding-left:${n.depth * 18}px` at `:72`) |
| Node contract (`path`, `depth`, `kind`, `mobility_mode`, `current_route_id`, `travel_progress`) | `src/frontend/alpine/fractal-locations.ts:22-32`, sourced from `src/locations/tree.ts:34-49, 230-262` |
| Transport badge — route name, progress %, ETA | `src/frontend/alpine/fractal-locations.ts:46-60`, `:70-74`; stop counts cached `:200-205` |
| Kind chips (All + every `LocationKind`) | `src/frontend/alpine/location-explorer-controls.ts:18-31`; markup `src/views/world-edit.html:903-920`; host binding `:921-922` |
| `filterTopLevelOnly` retained | `src/frontend/alpine/location-explorer.ts:75`; checkbox `src/views/world-edit.html:714` |
| Explorer-side kind filter | `src/frontend/alpine/location-explorer.ts:26-29, 78, 180, 194-195` |
| Tests: 4-level chain, badge format, static-no-badge, kind filter | `src/frontend/alpine/fractal-locations.test.ts:152-185` |

## Caveats (deviations from the original ticket text)

- The renderer is exported as `renderTreeMarkup(nodes, meta, filterKind)` from `fractal-locations.ts:66` and mounted as global `fractalTreeMarkup` (`:289`), not `walk(rootId)` from `location-explorer.ts`. The Explore tab's flat list is unchanged; the recursive tree is the new Fractal tab (`src/views/world-edit.html:888-893`).
- Expand/collapse uses the native `<details>` element (`:73`), not Alpine `x-data` + `x-show`. No third-party tree library; injected rows carry no Alpine directives, and the host uses `x-html` (`world-edit.html:922`).
- Badge appears when `current_route_id` is set (`:54`), which in practice means transport nodes; the ticket's literal `kind === 'transport'` check is not used.
- ETA is stop-count × `seconds_per_unit`, and loop routes are treated as linear (`fractal-locations.ts:55`); no waypoint-coordinate interpolation.
- Depth ≤ 12 is enforced upstream by `LOCATION_DEPTH_LIMIT` (`src/locations/tree.ts:32`) and the integrity migration, not by the renderer.

## Acceptance Criteria

- [x] Recursive renderer over the full tree — `src/frontend/alpine/fractal-locations.ts:66-77`.
- [x] Indentation / expand / collapse, no third-party library — native `<details>` at `:72-75`.
- [x] Filter chips All / Region / Settlement / Building / Room / Transit / Transport / Pocket — `kindOptions` built from `LocationKind` (`src/frontend/alpine/location-explorer-controls.ts:18-22`), rendered `src/views/world-edit.html:909-919`.
- [x] Transport badge: `current_route_id` name, `travel_progress` %, ETA from stop count + `seconds_per_unit` — `src/frontend/alpine/fractal-locations.ts:46-60`.
- [x] `filterTopLevelOnly` retained — `src/frontend/alpine/location-explorer.ts:75`, `src/views/world-edit.html:714`.
- [x] Tests: 3+-level chain indentation, transport-only filter, badge formatting with stub data — `src/frontend/alpine/fractal-locations.test.ts:153-185` (4-level chain at `:153-163`, badge `:165-172`, static no-badge `:174-177`, kind filter `:180-185`).

## Out of Scope

- Drag-and-drop reparenting UI (separate ticket if requested).
- Map-renderer overlay for transport position (separate ticket under visual novel / map epic).

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
- `TASK-fractal-locations-api-routes.md`
- `TASK-location-explorer.md` (✅ done 2026-08-22, basic single-level explorer — this ticket extends it)
