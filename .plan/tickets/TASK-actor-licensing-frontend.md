# TASK: Actor Licensing Frontend

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** Low
**Epic:** epic-frontend-backend-integration
**Tags:** licensing, frontend, actor, character

## Summary

Create frontend UI for character licensing info. Backend routes exist at `/api/actors/:actorId/licensing` but no frontend UI exists.

## Backend Routes (already exist)

| Route                            | Method | Purpose            |
| -------------------------------- | ------ | ------------------ |
| `/api/actors/:actorId/licensing` | GET    | Get licensing info |

## Files to Create

- `src/frontend/alpine/actor-licensing.ts` — Licensing component
- `src/components/character/licensing-panel.html` — Licensing panel template

## Acceptance Criteria

- [ ] Licensing info display in character info panel
- [ ] License type, terms, restrictions
- [ ] Loading and error states

## Related

- `TASK-character-licensing.md` — Existing task
