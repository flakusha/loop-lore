<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: World Lore Entries: add Alpine.js UI for CRUD

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

The BE registers full CRUD for `/api/worlds/:worldId/lore-entries[/:entityId]` via
`createEntityRoutes` (`src/routes/world-lore-entries.ts:65-112`), but no FE caller exists.
Confirmed by harmonization check (post-checker-fix on commit 393a9815a): 5 advisories
still flagged BE-no-FE for these routes after the `${prefix}`/`${R}`/entityPaths
template-var resolution landed.

## Goal

Add Alpine.js UI for managing world lore entries (list, create, view, edit, delete)
per world. Surface in the world editor or as a tab on the world detail page.

## Scope

- 5 BE endpoints (auto-CRUD via `createEntityRoutes`; schema already in db):
  - GET    /api/worlds/:worldId/lore-entries
  - POST   /api/worlds/:worldId/lore-entries
  - GET    /api/worlds/:worldId/lore-entries/:entityId
  - PUT    /api/worlds/:worldId/lore-entries/:entityId
  - DELETE /api/worlds/:worldId/lore-entries/:entityId
- Alpine.js module: `src/frontend/alpine/world-lore-entries.ts` (or similar)
- HTML partial: `src/views/.../lore-entries.partial.html` with `hx-*` or `apiFetch` wiring
- Smoke test: new FE call paths covered; existing BE test stays green

## Acceptance

- [ ] UI lists lore entries for a world
- [ ] Create / edit / delete work and reflect in the list
- [ ] Permission gate matches world-editor (world owner / `admin.character`)
- [ ] i18n strings added (en at minimum)
- [ ] No new BE drift — `fe-be harmony` gate stays at 0 blocking after this lands
- [ ] dprint + check:unit green on changed paths

## Notes

- Out of scope: API design changes (`createEntityRoutes` CRUD is canonical)
- E2E test optional (AGENTS.md does not require e2e for FE-only work)
- Blocked by: nothing; can land in a follow-up worktree

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
