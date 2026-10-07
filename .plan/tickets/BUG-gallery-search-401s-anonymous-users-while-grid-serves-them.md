<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Gallery search 401s anonymous users while grid serves them

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

Evidence (approved finding 7, P3; .tmp/concern-dev-2026-10-07.md, .tmp/concern-auth.md): src/routes/views/plugin-dynamic.ts:59-77 — requireUserId was added to /dynamic/gallery/search only (plugin-dynamic.ts:65-66) while the grid keeps ctx.userId as string | null with no gate (plugin-dynamic.ts:32-44), and /views/:name has no auth gate (src/routes/views/plugin-pages.ts:162-183). Executed evidence (bun .tmp/repro-views3.ts, throwing-DB proxy): /dynamic/gallery/grid -> 500 DB TOUCHED (no gate; handler ran), /dynamic/gallery/search -> 401 Unauthorized (gate fired first), grid non-HTMX -> 302 (redirect guard intact). Anonymous gallery page: grid renders public assets while search silently no-ops (HTMX ignores non-2xx). The same commit (8b4eae500) scopes search with applyGalleryAssetFilters, so anonymous search would return exactly the grid's public set — the 401 adds no confidentiality gain. Fix: drop the requireUserId block and pass ctx.userId like the grid, or gate the grid identically so both fail closed together.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
