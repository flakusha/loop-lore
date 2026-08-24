<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actor emotion avatars frontend panel

**Status:** ⬜ Not Started
**Priority:** P2
**Epic:** epic-frontend-backend-integration / epic-emotion-avatar-message-binding
**Labels:** emotion-avatar, frontend, actor, character
**Related:** TASK-actor-emotion-avatars-frontend.md, TASK-emotion-avatar-message-binding.md, src/components/chat/mood-panel.html

## Summary

Replace the mood-panel "Generate emotion avatars" button (a single inline
trigger inside `mood-panel.html`) with a proper per-actor emotion-avatars
panel: list existing emotion avatars, trigger batch generation, show job
progress, allow per-emotion re-generation and deletion. Backend routes and
the in-app batch job store already exist; only the UI surface is missing.

## Context

- Backend routes exist at `/api/actors/:actorId/emotion-avatars/*` and are
  ownership-checked (character-emotion-avatars.ts).
- `EmotionAvatarService` exposes `listJobs(actorId)`, `getJobStatus(jobId)`,
  `startBatchGeneration`, `cancelJob`, `getEmotionPromptModifier`.
- `TASK-actor-emotion-avatars-frontend.md` already documents the gap but
  hasn't been started; this ticket is the implementation.
- Current state in `src/components/chat/mood-panel.html:93-113`: an inline
  button calling `generateEmotionAvatars()` from
  `src/frontend/alpine/mood/avatars.ts:52-96`. That flow:
  - calls POST with `{ baseAvatarId }` (no per-emotion selection)
  - polls job status until completed/failed
  - reloads emotion avatars on completion
- No display of existing per-emotion avatars; no per-emotion regen; no
  delete.

## Scope

Create `src/frontend/alpine/actor-emotion-avatars.ts` Alpine component with
state + methods, and
`src/components/character/emotion-avatars-panel.html` partial. Wire into
the character detail modal and (optionally) the chat mood panel.

API surface consumed:

- `GET /api/actors/:actorId/avatars` — list existing (with tags)
- `POST /api/actors/:actorId/emotion-avatars` — start batch
- `GET  /api/actors/:actorId/emotion-avatars/jobs/:jobId` — poll
- `POST /api/actors/:actorId/emotion-avatars/jobs/:jobId/cancel` — cancel
- `GET  /api/emotions/types` — list selectable emotion types
- `DELETE /api/actors/:actorId/avatars/:avatarId` — drop a variant

## Acceptance Criteria

- [ ] Panel lists existing emotion avatars (filtered to `tags.emotion`
      rows) with thumbnail + emotion label + delete button.
- [ ] "Generate batch" button opens emotion picker (multi-select from
      `/api/emotions/types`) and starts a batch job.
- [ ] Per-job progress indicator (poll every 2s, stop on completed/failed/
      cancelled, max 5min as today).
- [ ] Cancel button visible while job is `running`.
- [ ] Per-emotion regenerate (POST with `{ emotions: ["happy"] }`) on the
      list rows.
- [ ] Empty-state copy when character has no emotion avatars yet.
- [ ] Loading + error states (`_emotionAvatarsLoading`, toast on POST failure).
- [ ] `bun run check` + manual browser probe of the panel green.