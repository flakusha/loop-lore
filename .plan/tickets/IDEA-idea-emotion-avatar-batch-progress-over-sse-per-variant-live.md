<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# IDEA: IDEA emotion-avatar batch progress over SSE: per-variant live progress

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Tags:** idea, avatars, sse
**Context:** Emotion-avatar batch generation tracked in an in-memory job store the client must poll; per-variant progress could ride the existing generation SSE channel.

## Summary

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA: Emotion-avatar batch progress events over SSE

**Status:** Not Started
**Priority:** P3
**Effort:** Medium
**Epic:** epic-emotion-avatar-message-binding.md
**Summary:** Emotion-avatar batch generation runs server-side with an in-memory job store the client must poll; surface per-variant progress over the existing generation SSE channel so the character sheet shows live progress.
**Acceptance Criteria:** (see below)
**Tags:** idea, frontend, avatars, sse
**Related:** src/characters/services/emotion-avatar-service/job-store.ts, src/characters/services/emotion-avatar-service/generation.ts, git issue 580d430

## Summary

`EmotionAvatarService` runs batch generation (`generation.ts`,
`runBatchGeneration`) tracked in an in-memory `job-store.ts` that dies
with the server. The client today polls `getJob`/`listJobs` for status —
no progress events, no per-variant completion signal. The story-state SSE
clarification (TASK-story-alpine, 2026-09-26) establishes the pattern for
a world-scoped event feed (git issue `580d430`); avatar batch progress is
the same shape (job id → per-variant done/total) and could ride the same
channel or the generation SSE channel instead of polling.

## Acceptance Criteria

- [ ] Batch job emits per-variant progress events (variant done/total) on an existing SSE channel; polling retained as fallback
- [ ] Character sheet / avatar manager subscribes and renders a progress bar; reconnect + stale-job guard included
- [ ] Job-store volatility (server-lifetime) documented in `docs/spec/emotion-avatars.md` as the retry contract
- [ ] No new auth surface: events scoped to the requesting user via existing generationSSE auth

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
