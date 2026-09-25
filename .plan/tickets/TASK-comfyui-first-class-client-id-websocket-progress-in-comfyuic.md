<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI first-class: client_id + WebSocket progress in ComfyUIClient

**Status:** open
**Priority:** high
**Effort:** Medium (WS client + progress subscription + fallback)
**Summary:** `client_id` request body + `subscribeProgress` sentinel/fallback in `ComfyUIClient`; `generateComfyUI` passes `client_id` always so progress events route to the requesting caller.
**Context:** First-Class Program step 2 (`epic-comfyui-plugin.md`). Unblocks `TASK-2026-openwebui-comfyui-websocket-progress`. Without per-call client_id, WS progress events cannot be attributed to a generation and callers must poll.

**Acceptance Criteria:**
- [ ] `ComfyUIClient` accepts + sends `client_id` on prompt submit.
- [ ] `subscribeProgress` subscribes to WS events filtered by `client_id`; sentinel timeout falls back to polling `/history` so generation never hangs on WS failure.
- [ ] `generateComfyUI` generates/threads a `client_id` per call; concurrent callers see only their own events.
- [ ] Unit tests: event routing per client_id, sentinel fallback path, WS-drop mid-generation.
- [ ] `bun run check` green.

**Epic:** epic-comfyui-plugin
**Tags:** comfyui, websocket, client-id, progress, generation
**Related:** TASK-2026-openwebui-comfyui-websocket-progress, TASK-comfyui-first-class-standalone-auto-start-config-lifecycle


git issue: fc20566
