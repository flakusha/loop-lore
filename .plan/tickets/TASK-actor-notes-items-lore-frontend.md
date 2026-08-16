<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actor Notes, Items, and Lore Entries Frontend

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Tags:** notes, items, lore, frontend, actor

## Summary

Create frontend UI for actor notes, items, and lore entries. Backend routes exist at `/api/actors/:actorId/notes`, `/api/actors/:actorId/items`, `/api/actors/:actorId/lore-entries` (via entity factory) but no frontend UI exists.

## Backend Routes (already exist via entity factory)

| Route                                        | Method         | Purpose                      |
| -------------------------------------------- | -------------- | ---------------------------- |
| `/api/actors/:actorId/notes`                 | GET/POST       | List/create notes            |
| `/api/actors/:actorId/notes/:noteId`         | GET/PUT/DELETE | Get/update/delete note       |
| `/api/actors/:actorId/items`                 | GET/POST       | List/create items            |
| `/api/actors/:actorId/items/:itemId`         | GET/PUT/DELETE | Get/update/delete item       |
| `/api/actors/:actorId/lore-entries`          | GET/POST       | List/create lore entries     |
| `/api/actors/:actorId/lore-entries/:entryId` | GET/PUT/DELETE | Get/update/delete lore entry |

## Files to Create

- `src/frontend/alpine/actor-notes.ts` — Notes component
- `src/frontend/alpine/actor-items.ts` — Items component
- `src/frontend/alpine/actor-lore.ts` — Lore component
- `src/components/character/notes-panel.html` — Notes panel template
- `src/components/character/items-panel.html` — Items panel template
- `src/components/character/lore-panel.html` — Lore panel template

## Acceptance Criteria

- [ ] Notes list with create/edit/delete
- [ ] Items list with create/edit/delete
- [ ] Lore entries list with create/edit/delete
- [ ] Search and filter functionality
- [ ] Loading and error states

## Related

- `epic-actors.md` — Actors epic
- `TASK-character-core-system.md` — Character core task
