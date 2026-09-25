<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI first-class: image generation queue honors ComfyUI backend

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-generation-flow-control
**Tags:** comfyui, queue

**Summary:** Scope the ComfyUI specifics of the image queue: concurrency 1 per baseUrl, `/interrupt` cancel, WS progress events, shared code path for both modes.

**Context:**

`TASK-local-image-generation-queue.md` (open, Medium) already designed the queue: in-memory priority job store mirroring `src/generation/matting/job-store.ts`, bounded concurrency per provider, per-user rate limit via `createRateLimiter` (429 + Retry-After), chat/global hold flags from `epic-generation-flow-control.md`. That design is backend-agnostic; this task scopes the ComfyUI specifics so the queue honors how ComfyUI actually behaves. Key fact: ComfyUI is a single-pipeline queue internally — parallel prompts serialize server-side anyway, so client concurrency >1 buys nothing but contention.

## Implementation

1. Concurrency: bound to 1 per resolved ComfyUI `baseUrl` (standalone and proxy keys separately — key the limiter by resolved baseUrl string, so both modes share one code path but independent slots).
2. Cancel: `POST {base}/interrupt` (existing `cancelExecution`) wired to queue-cancel; prompt_id scoping improves once TASK 2 lands `client_id`.
3. Progress: WS events from TASK 2 feed queue position/percent events (queued → running {progress} → done); poll path reports queued/running/done only.
4. Rate limit: reuse `createRateLimiter` per user; hold flags (chat/global) checked before dequeue, same as the base design.
5. Depends on: base queue from TASK-local-image-generation-queue; `client_id` + WS from TASK 2 (progress/cancel scoping degrades gracefully without them — poll + global interrupt).

**Acceptance Criteria:**

- [ ] Concurrency 1 per resolved ComfyUI baseUrl; standalone/proxy independent
- [ ] Queue-cancel issues `/interrupt`; WS progress surfaces queue position
- [ ] Per-user 429 + Retry-After; hold flags honored
- [ ] Tests: concurrency bound, cancel interrupts, rate-limit headers
- [ ] Documentation updated (queue section in image-generation.md)
