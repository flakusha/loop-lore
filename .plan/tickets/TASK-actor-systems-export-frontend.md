# TASK: Actor Systems Export/Import Frontend

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Tags:** systems, export, import, frontend, actor

## Summary

Create frontend UI for exporting/importing actor systems data. Backend routes exist at `/api/actors/:actorId/systems/*` but no frontend UI exists.

## Backend Routes (already exist)

| Route                                 | Method | Purpose             |
| ------------------------------------- | ------ | ------------------- |
| `/api/actors/:actorId/systems/export` | GET    | Export systems data |

## Files to Create

- `src/frontend/alpine/actor-systems.ts` — Systems export/import component
- `src/components/character/systems-panel.html` — Systems panel template

## Acceptance Criteria

- [ ] Export systems data button
- [ ] Import systems data dialog
- [ ] Export format selection (JSON, etc.)
- [ ] Loading and error states

## Related

- `epic-import-export-io.md` — Import/export epic
