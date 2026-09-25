<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI first-class: image generation queue honors ComfyUI backend

**Status:** open
**Priority:** medium
**Effort:** Medium (queue scoping + cancel + events)
**Summary:** Image generation queue scopes concurrency to 1 per ComfyUI baseUrl, supports `/interrupt` cancel, and emits WS queue events so callers observe position/state; depends on the base queue plus `client_id`/WS progress.
**Context:** First-Class Program step (`epic-comfyui-plugin.md`); serves `epic-generation-flow-control`. ComfyUI processes one job per instance at a time; the queue must respect that instead of flooding and dropping.

**Acceptance Criteria:**
- [ ] Per-baseUrl concurrency 1 (per ComfyUI instance), independent of other backends' limits.
- [ ] `/interrupt` cancels the in-flight ComfyUI job and releases the slot; queued callers observe cancellation.
- [ ] WS queue events (queued/started/completed/cancelled) reach subscribers keyed by `client_id`.
- [ ] Tests: concurrency cap, interrupt release, event delivery, multi-baseUrl isolation.
- [ ] `bun run check` green.

**Epic:** epic-comfyui-plugin
**Tags:** comfyui, queue, concurrency, interrupt, websocket, generation-flow-control
**Related:** epic-generation-flow-control, TASK-comfyui-first-class-client-id-websocket-progress-in-comfyuic


git issue: 1c29c3c
