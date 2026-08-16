<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actor Emotion Avatars Frontend

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Tags:** emotion-avatars, frontend, actor, character

## Summary

Create frontend UI for emotion avatar batch generation. Backend routes exist at `/api/actors/:actorId/emotion-avatars/*` but no frontend UI exists.

## Backend Routes (already exist)

| Route                                              | Method | Purpose                      |
| -------------------------------------------------- | ------ | ---------------------------- |
| `/api/actors/:actorId/emotion-avatars/jobs`        | GET    | List batch generation jobs   |
| `/api/actors/:actorId/emotion-avatars/jobs/:jobId` | GET    | Get specific job status      |
| `/api/actors/:actorId/emotion-avatars`             | POST   | Trigger batch generation     |
| `/api/emotions/prompt-modifier/:emotion`           | GET    | Get emotion prompt modifier  |
| `/api/emotions/types`                              | GET    | List available emotion types |

## Files to Create

- `src/frontend/alpine/actor-emotion-avatars.ts` — Emotion avatars component
- `src/components/character/emotion-avatars-panel.html` — Emotion avatars panel template

## Acceptance Criteria

- [ ] Emotion avatar list for character
- [ ] Batch generation trigger
- [ ] Job progress display
- [ ] Emotion type selector
- [ ] Loading and error states

## Related

- `epic-emotion-avatar-message-binding.md` — Emotion avatar epic
- `TASK-emotion-avatar-message-binding.md` — Existing task
- `TASK-emotions-avatar-edit-model.md` — Existing task
- `TASK-aux-emotion-avatar.md` — Existing task
