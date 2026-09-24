<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-openwebui-comfyui-websocket-progress: ComfyUI WebSocket Progress Tracking in `image-engine`

**Status:** open
**Priority:** medium
**Effort:** Small
**Labels:** generation, image-engine, comfyui
**Summary:** When the active image backend is ComfyUI, replace the blocking HTTP poll with a WebSocket subscription on `{baseUrl}/ws?clientId={clientId}` after `queue_prompt`, draining messages until the `{"type":"executing","data":{"node":null}}` sentinel signals completion. Final outputs are fetched via `GET {baseUrl}/history/{prompt_id}`. Progress messages emit as `image-progress` SSE events through the existing `StreamBuffer`. Falls back to the current blocking HTTP path if the WS handshake fails.

**Context:** Loop-lore's `generateComfyUI` in `src/generation/image-engine/comfyui.ts` blocks on the synchronous `/prompt` endpoint and only surfaces outputs after ComfyUI finishes. That hides generation latency from the user and prevents progressive UI hints. Open-webui subscribes to the ComfyUI WS feed and pipes `executing`/`progress_value` events back to the chat as streamed updates; the same approach keeps the chat UX responsive during image generation.

**Acceptance Criteria:**

- [ ] `generateComfyUI` opens `{baseUrl}/ws?clientId={clientId}` immediately after a successful `queue_prompt` response.
- [ ] Each `executing` message (non-null `node`) emits an `image-progress` event via `StreamBuffer`.
- [ ] Completion sentinel `{"type":"executing","data":{"node":null}}` closes the WS, fetches `/history/{prompt_id}`, and resolves the generation promise with the same shape returned today.
- [ ] If WS handshake fails (network error, timeout), the function falls back to the existing blocking HTTP poll with no user-visible regression.
- [ ] No change to callers outside `src/generation/image-engine/`.

**Description:**

Wire-up sketch:

```ts
if (apiFamily === "comfyui") {
  const ws = new WebSocket(`${baseUrl}/ws?clientId=${clientId}`);
  ws.onmessage = (msg) => {
    const payload = JSON.parse(msg.data);
    if (payload.type === "progress_value") {
      streamBuffer.append(StreamEventType.ImageProgress, payload.data);
    }
    if (payload.type === "executing" && payload.data?.node === null) {
      ws.close();
      const history = await fetch(`${baseUrl}/history/${promptId}`).then(r => r.json());
      resolve(history[promptId]);
    }
  };
}
```

The `apiFamily === 'comfyui'` dispatch already lives at
`src/generation/image-engine/index.ts:46–47`; the new logic slots into
`src/generation/image-engine/comfyui.ts`. If the WS connection throws or the
handshake times out, the function MUST fall through to the existing blocking
`POST /prompt` polling loop unchanged.

**Acceptance Criteria:**

- [ ] `generateComfyUI` opens `{baseUrl}/ws?clientId={clientId}` immediately after a successful `queue_prompt` response.
- [ ] Each `executing` message (non-null `node`) emits an `image-progress` event via `StreamBuffer`.
- [ ] Completion sentinel `{"type":"executing","data":{"node":null}}` closes the WS, fetches `/history/{prompt_id}`, and resolves the generation promise with the same shape returned today.
- [ ] If WS handshake fails (network error, timeout), the function falls back to the existing blocking HTTP poll with no user-visible regression.
- [ ] No change to callers outside `src/generation/image-engine/`.

**Notes:**

- Re-use the existing `clientId` already generated for the prompt request. Don't mint a new one for the WS.
- `image-progress` SSE type may live in the same `StreamEventType` enum introduced by TASK-2026-openwebui-stream-event-type-registry.
- ponytail: WS reconnect/backoff policy is intentionally naive — single attempt, then HTTP fallback. Add reconnect when ComfyUI flake shows up in logs.

**References:**

- loop-lore: `src/generation/image-engine/index.ts:46–47` — `apiFamily === 'comfyui'` dispatch.
- loop-lore: `src/generation/image-engine/comfyui.ts` — current blocking HTTP `generateComfyUI` implementation.
- loop-lore: `src/generation/stream-buffer.ts` — `append()` sink for `image-progress` events.
- open-webui: `open-webui/backend/open_webui/utils/images/comfyui.py:69–100` — WS subscribe, completion sentinel, `/history/{prompt_id}` fetch.


git issue: 95d1905
