<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actor Availability Frontend

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** Low
**Epic:** epic-frontend-backend-integration
**Tags:** availability, frontend, actor, character

## Summary

Create frontend UI for character availability. Backend routes exist at `/api/actors/:actorId/availability` but no frontend UI exists.

## Backend Routes (already exist)

| Route                               | Method | Purpose          |
| ----------------------------------- | ------ | ---------------- |
| `/api/actors/:actorId/availability` | GET    | Get availability |

## Files to Create

- `src/frontend/alpine/actor-availability.ts` — Availability component
- `src/components/character/availability-panel.html` — Availability panel template

## Acceptance Criteria

- [ ] Availability display in character info panel
- [ ] Calendar-style view
- [ ] Loading and error states

## Related

- `epic-character-core-system.md` — Character core epic
