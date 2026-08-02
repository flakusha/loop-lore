# TASK: Actor Relationships Frontend

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Tags:** relationships, frontend, actor, character

## Summary

Create frontend UI for character relationships. Backend routes exist at `/api/actors/:actorId/relationships` but no frontend UI exists.

## Backend Routes (already exist)

| Route                                               | Method | Purpose                   |
| --------------------------------------------------- | ------ | ------------------------- |
| `/api/actors/:actorId/relationships`                | GET    | List relationships        |
| `/api/actors/:actorId/relationships/:targetActorId` | GET    | Get specific relationship |

## Files to Create

- `src/frontend/alpine/actor-relationships.ts` — Relationships component
- `src/components/character/relationships-panel.html` — Relationships panel template

## Acceptance Criteria

- [ ] Relationship list in character info panel
- [ ] Relationship details (type, status, history)
- [ ] Relationship map visualization (optional)
- [ ] Loading and error states

## Related

- `epic-relationships.md` — Relationships epic
- `TASK-character-relationships.md` — Existing task
