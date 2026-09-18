<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actor Traits Frontend

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done (merged to dev 2026-09-15)
**Priority:** P2
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Tags:** traits, frontend, actor, character

## Resolution

Merged to dev in `991f6f050` (`feat(frontend): mount actor panels, export progress; drop orphan`):

- `src/frontend/alpine/actor-traits.ts` — permanent-traits list/create/update/delete with search + category filter.
- `src/components/character/traits-panel.html` — mounted inline in `src/routes/views/character-edit-form.ts`.

## Summary

Create frontend UI for character traits. Backend routes exist at `/api/actors/:actorId/traits` but no frontend UI exists.

## Backend Routes (already exist)

| Route                                                         | Method | Purpose                 |
| ------------------------------------------------------------- | ------ | ----------------------- |
| `/api/actors/:actorId/traits`                                 | GET    | List traits             |
| `/api/actors/:actorId/traits/location/:locationId`            | GET    | Location traits         |
| `/api/actors/:actorId/traits/location/:locationId/:traitName` | GET    | Specific location trait |

## Files to Create

- `src/frontend/alpine/actor-traits.ts` — Traits component
- `src/components/character/traits-panel.html` — Traits panel template

## Acceptance Criteria

- [ ] Traits display in character info panel
- [ ] Location-specific traits
- [ ] Trait filtering by type
- [ ] Loading and error states

## Related

- `epic-character-core-system.md` — Character core epic
- `TASK-character-rpg-stats.md` — RPG stats task
