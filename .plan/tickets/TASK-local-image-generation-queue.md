<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Local image generation queue with pause and rate limit

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-llm-queue.md (see also epic-generation-flow-control.md)
**Status:** open
**Priority:** Medium

## Problem

`POST /api/generation/image` (`src/generation/image-gen-route.ts`) awaits
`generateImages(...)` synchronously inside the request. A slow local backend
(ComfyUI/sd.cpp) holds the HTTP connection, and concurrent requests
parallel-press local inference. "image-queue" exists only as a cancellation
side-effect job kind — no actual queue.

## Design

- In-memory priority job store mirroring `src/generation/matting/job-store.ts`
  (and the emotion-avatar batch pattern): `queued | running | done | failed |
  cancelled`, bounded concurrency per provider, per-user rate limit reusing
  `createRateLimiter` (429 + Retry-After), honor per-chat/global hold flags
  from `epic-generation-flow-control.md`.
- Route returns `202` with a request id immediately; poll via the existing
  async request-result store (`GET /api/requests/:id/status`) or the matting
  status route pattern; assets linked on completion.
- Frontend: queue-aware submit (optimistic "queued" card), pause/cancel from
  the gallery/composer; generation pause button (frontend-side pause)
  reuses `isChatPaused` toggling.

## Acceptance

- Mock-backed tests: enqueue while at concurrency cap → queued;
  pause → in-flight finishes, queued do not start; rate limit → 429 after
  window burst; cancel mid-run → `cancelled` terminal state.
