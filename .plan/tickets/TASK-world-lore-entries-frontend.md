# TASK: World Lore Entries Frontend

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Tags:** lore, frontend, world, location

## Summary

Create frontend UI for world lore entries. Backend routes exist at `/api/worlds/:worldId/lore-entries` (via entity factory) but no frontend UI exists.

## Backend Routes (already exist via entity factory)

| Route                                        | Method         | Purpose                      |
| -------------------------------------------- | -------------- | ---------------------------- |
| `/api/worlds/:worldId/lore-entries`          | GET/POST       | List/create lore entries     |
| `/api/worlds/:worldId/lore-entries/:entryId` | GET/PUT/DELETE | Get/update/delete lore entry |

## Files to Create

- `src/frontend/alpine/world-lore.ts` — World lore component
- `src/components/world/lore-panel.html` — Lore panel template

## Acceptance Criteria

- [ ] Lore entries list in world edit page
- [ ] Create/edit/delete lore entries
- [ ] Search and filter functionality
- [ ] Loading and error states

## Related

- `epic-world-locations.md` — World locations epic
- `TASK-world-locations.md` — Existing task
