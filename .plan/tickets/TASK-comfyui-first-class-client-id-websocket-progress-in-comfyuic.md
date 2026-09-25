<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI first-class: client_id + WebSocket progress in ComfyUIClient

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-comfyui-plugin
**Tags:** comfyui, websocket

**Summary:** `client_id` in `/prompt` body + `subscribeProgress` WebSocket primitive so generations stream progress instead of blocking silently.

**Context:**

`ComfyUIClient` (src/generation/providers/comfyui.ts:61-263) speaks plain HTTP only: `POST /prompt` (body `{prompt}` — no `client_id`), poll `GET /history/{id}`, `GET /view`, `GET /object_info`. No `/ws` anywhere, so today every generation blocks the HTTP connection with zero progress. The open ticket TASK-2026-openwebui-comfyui-websocket-progress already scoped the WS approach for `image-engine`; this task lands the client primitive it needs plus the `client_id` the epic's blocking-gaps list calls out. Note the llama-swap interplay: proxied mode sets `compatibility.ignoreWebsockets: true`, so browser `/ws` never wakes the model — server-side WS from loop-lore to ComfyUI still works, but progress subscription should target the resolved backend directly when proxied.

## Implementation

1. `ComfyUIClientOptions`: add `clientId?: string` (default `randomUUID()` per client instance — stable across prompts so `/ws` streams all of this client's executions).
2. `submitWorkflow(workflow, opts?: { clientId?: string })`: body becomes `{prompt: workflow, client_id}`. Keep param optional so existing callers (`image-engine/comfyui.ts`, `image-edit/providers/comfyui-provider.ts`) compile unchanged.
3. New `subscribeProgress(promptId, { clientId, onProgress, onDone, signal })`: open `{baseUrl}/ws?clientId={id}`, dispatch `progress`/`progress_state` → `onProgress({value,max})`, close on `{type:'executing',data:{node:null}}` sentinel → `onDone()`. Handshake failure/timeout → reject with typed error so callers fall through to blocking poll (no user-visible regression).
4. `runWorkflow`: add `opts?: { onProgress?, useWebSocket?: boolean }` — default keeps blocking poll (safe); `generateComfyUI` opts in when ready.
5. `generateComfyUI` (src/generation/image-engine/comfyui.ts): always pass `client_id` (multi-client scoping even on poll path); WS opt-in behind the StreamBuffer `image-progress` event wiring from the open ticket.

**Acceptance Criteria:**

- [ ] `/prompt` body includes `client_id`; existing callers compile unchanged
- [ ] `subscribeProgress` resolves on sentinel, rejects on handshake failure (caller falls back to poll)
- [ ] `generateComfyUI` passes `client_id` always; progress events flow when WS enabled
- [ ] Tests: body shape, sentinel close, fallback path, no change to callers outside image-engine
- [ ] Documentation updated (image-generation.md ComfyUI section: client_id + WS)
