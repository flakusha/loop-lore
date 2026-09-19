<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Location Explorer — Recursive Tree + Transport Badge

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** ui, alpine, location-explorer, tree, transport

**Summary:** Replace single-level location-explorer tree with recursive walker (depth ≤ 12). Transport badge displays current_route, travel_progress %, ETA. Filter chips by kind. No third-party tree library.
**Context:** Current location-explorer renders one level only — a ship with cabins appears flat. The recursive walker + transport badge makes fractal hierarchy visible to GMs and players alike.
**Acceptance Criteria:** See acceptance checklist below.

## Summary

Replace the single-level tree in `src/frontend/alpine/location-explorer.ts`
with a **recursive walker** that renders the full fractal tree (depth ≤ 12).
Add a **transport badge** to nodes with `kind === 'transport'` showing the
transport's current stop, route progress, and ETA. Filter by `kind` (region,
settlement, building, room, transit, transport, pocket).

## Acceptance Criteria

- [ ] `location-explorer.ts` exports a recursive renderer `walk(rootId)` →
      nested UI tree.
- [ ] Indentation / expand / collapse uses Alpine `x-data` + `x-show`;
      no third-party tree library.
- [ ] Filter chips: All / Region / Settlement / Building / Room / Transit /
      Transport / Pocket.
- [ ] Transport badge displays:
      - `current_route_id` name.
      - `travel_progress` as a percentage.
      - ETA based on route waypoints + `seconds_per_unit`.
- [ ] Existing `filterTopLevelOnly` mode retained.
- [ ] Tests in `location-explorer.test.ts`:
      - Render 3-level chain shows 3 indented rows.
      - Filter to `kind === 'transport'` shows only transport nodes.
      - Transport badge formatted correctly with stub data.

## Out of Scope

- Drag-and-drop reparenting UI (separate ticket if requested).
- Map-renderer overlay for transport position (separate ticket under
  visual novel / map epic).

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
- `TASK-fractal-locations-api-routes.md`
- `TASK-location-explorer.md` (✅ done 2026-08-22, basic single-level explorer — this ticket extends it)
