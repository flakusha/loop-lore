<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Bestiary Bestiary CRUD Routes Admin GM

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-enemies-monsters
**Tags:** bestiary, crud


Bestiary: Bestiary CRUD Routes Admin GM


- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Summary:**
Elysia CRUD routes for the bestiary catalog and per-location population, gated to admin/GM roles.

**Context:**
Once the schema is in place, admins need to author species, set repopulation rules, and adjust per-location population counts. Standard CRUD with admin/GM gate; reads available to all authenticated users (bestiary is a public reference).

**Acceptance Criteria:**
- `src/routes/bestiary.ts` mounted at `elysia-app.ts` with `GET /api/worlds/:worldId/bestiary` (auth, paginated), `GET /api/bestiary/:id` (auth), `POST/PUT/DELETE` (admin/GM).
- `GET /api/worlds/:worldId/locations/:locationId/population` (auth) returns rows + count.
- `POST /api/admin/bestiary/:speciesId/force-spawn` and `POST /api/admin/bestiary/:speciesId/force-cull` consume admin endpoints from this epic.
- Validation via existing Elysia t (`src/validation/schemas.ts`) extended with `BestiaryCategory`, `BestiaryBehaviour`, `RepopulationRule`.
- 401/403/422 tests. Idempotent force-spawn (cap respected).
