<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Actor Location & World Traits CRUD

**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Small–Medium
**Epic:** epic-character-core-system
**Related:** TASK-world-location-traits-routes, TASK-character-internal-traits
**Source:** FE-BE harmonization check, 2026-09-17 — 6 routes in this slice.

## Summary

Wire GET/POST/DELETE for per-actor location-scoped and world-scoped traits. The
backend exposes these routes but no web UI reads or mutates them today.

## Backend surface

| Method | Path | File |
|--------|------|------|
| GET | `/api/actors/:actorId/traits/location/:locationId` | `src/routes/character-traits/location.ts:38` |
| POST | `/api/actors/:actorId/traits/location/:locationId` | `src/routes/character-traits/location.ts:54` |
| DELETE | `/api/actors/:actorId/traits/location/:locationId/:traitName` | `src/routes/character-traits/location.ts:87` |
| GET | `/api/actors/:actorId/traits/world/:worldId` | `src/routes/character-traits/world.ts:38` |
| POST | `/api/actors/:actorId/traits/world/:worldId` | `src/routes/character-traits/world.ts:54` |
| DELETE | `/api/actors/:actorId/traits/world/:worldId/:traitName` | `src/routes/character-traits/world.ts:83` |

## Acceptance Criteria

- [ ] Character-sheet panel lists location + world traits per actor
- [ ] Inline create form on the panel calls POST with valid payload
- [ ] Inline delete (with confirm) calls DELETE; UI optimistically updates
- [ ] Trait data is fetched on actor load + invalidated on POST/DELETE
- [ ] `bun run check` green; no new blocking FE-BE findings
