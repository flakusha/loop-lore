<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actor Emotion Avatars Frontend

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done (merged to dev 2026-09-15)
**Priority:** P2
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Tags:** emotion-avatars, frontend, actor, character

## Resolution

Merged to dev in `991f6f050` (`feat(frontend): mount actor panels, export progress; drop orphan`):

- `src/frontend/alpine/actor-emotion-avatars.ts` — job list / batch trigger / progress / emotion-selector state plugin.
- `src/components/chat/emotion-avatars-panel.html` — panel body mounted inline in `src/routes/views/character-panels-section.ts`.

## Summary

Create frontend UI for emotion avatar batch generation. The shipped panel exposes the backend jobs, batch trigger, progress, and emotion selector.

## Backend Routes (already exist)

| Route                                              | Method | Purpose                      |
| -------------------------------------------------- | ------ | ---------------------------- |
| `/api/actors/:actorId/emotion-avatars/jobs`        | GET    | List batch generation jobs   |
| `/api/actors/:actorId/emotion-avatars/jobs/:jobId` | GET    | Get specific job status      |
| `/api/actors/:actorId/emotion-avatars`             | POST   | Trigger batch generation     |
| `/api/emotions/prompt-modifier/:emotion`           | GET    | Get emotion prompt modifier  |
| `/api/emotions/types`                              | GET    | List available emotion types |

## Shipped Files

- `src/frontend/alpine/actor-emotion-avatars.ts` — emotion-avatar jobs, progress, and selector state
- `src/components/chat/emotion-avatars-panel.html` — mounted emotion-avatar panel

## Acceptance Criteria

- [x] Emotion avatar list for character
- [x] Batch generation trigger
- [x] Job progress display
- [x] Emotion type selector
- [x] Loading and error states

## Related

- `epic-emotion-avatar-message-binding.md` — Emotion avatar epic
- `TASK-emotion-avatar-message-binding.md` — Existing task
- `TASK-emotions-avatar-edit-model.md` — Existing task
- `TASK-aux-emotion-avatar.md` — Existing task

## Notes

**Reconciliation (2026-09-02)**: Absorbed the panel sibling (merged frontend ticket scoped to binding-epic render tasks per matrix reconciliation; grid group-by-outfit deferred to wardrobe epic).


## Current implementation

- `src/frontend/alpine/actor-emotion-avatars.ts` — job list, batch trigger, progress, and emotion selector state.
- `src/components/chat/emotion-avatars-panel.html` — mounted emotion-avatar panel.
