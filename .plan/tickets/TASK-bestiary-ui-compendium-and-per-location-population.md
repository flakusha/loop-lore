<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Bestiary Bestiary UI Compendium And Per Location Population

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-enemies-monsters
**Tags:** bestiary, ui


Bestiary: Bestiary UI Compendium And Per Location Population


- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Summary:**
Bestiary compendium UI (world-level browse + per-location population view) on the admin/world-management surfaces.

**Context:**
The admin needs to inspect the catalog (filtered by category and location tag) and the per-location population counts. UI reuses existing admin layout (`src/frontend/alpine/admin-*`) and world-management UI (`epic-world-management-ui`).

**Acceptance Criteria:**
- Compendium grid view under `worlds/:worldId/bestiary/`: filterable by category, search by name, links to per-species detail.
- Per-species detail: description, behaviour, stats, loot preview, quest bindings, habitat list. Edit (admin) and force-spawn/cull buttons.
- Per-location population panel on `locations/:locationId` admin page: tabular list of species + count, last-spawn/death tick, generation, ecology pressure.
- Use htmx for partial updates (count edit, force-spawn toast). No new client framework.
- Verified in browser via dev-server smoke.


git issue: b56f43c
