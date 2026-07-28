# Task: World/Location Detail Modal

**Epic:** epic-creative-studio.md (MVP Tier 1)
**Status:** ⬜ Not Started
**Effort:** Low
**Depends On:** —

## Goal

Modal for viewing and editing worlds and locations in Creative Studio.

## Acceptance Criteria

- [ ] Modal opens on click from search results
- [ ] Shows world details: name, description, state
- [ ] Shows nested locations list
- [ ] Edit form for world fields
- [ ] Location list with click-to-edit
- [ ] Create new location within world
- [ ] Dev mode: show world state JSON

## Implementation

- Alpine.js modal component
- htmx for form submission
- Integrate with `GET/PATCH /api/worlds/:worldId` and nested locations

## Files to Create/Modify

- `src/frontend/creative-studio/modals/world-modal.ts` (new)
