<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-openwebui-structured-toolcall-renderer: Structured Tool-Call Renderer for SSE `tool_call` Events

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Labels:** frontend, streaming, tools
**Summary:** Render SSE `event: tool_call` payloads as a live, in-place interactive tool-call block in the chat UI (Alpine `x-data` updates the block as the tool runs) rather than the current generic `stream-update` HTML bubble. On `event: tool_result`, replace the block with the result.

**Context:** Loop-lore already streams tool-call lifecycle on the SSE channel via the `_streamToolCalls` handler in `src/frontend/alpine/chat-types/core.ts:23` and the emitter in `src/generation/generate-route/stream-to-client.ts:146–154` (sends `tool_call` and `tool_result` events), but the frontend has no purpose-built renderer: the payload lands in the same flow as text tokens and surfaces through the generic stream swap. A dedicated, mutable block makes pending/running/done/error state observable to the user and matches open-webui's per-block reactive model.

Open-webui implements the same pattern in `open-webui/src/lib/components/chat/Messages/structuredOutput.ts:194–236` (`buildToolCallToken` converts a tool-call into a display token) and renders via `open-webui/src/lib/components/chat/Messages/ResponseMessage.svelte`. Loop-lore translates this to Alpine + htmx (no Svelte migration).

**Acceptance Criteria:**

- [ ] New partial `src/partials/chat/tool-call-block.html` exists and is referenced when the consumer detects an `event: tool_call`.
- [ ] New Alpine component `src/frontend/alpine/chat-types/tool-call-render.ts` exposes a `toolCallRender(cell)` factory consumable from htmx-rendered chat HTML via `x-data`.
- [ ] `_streamToolCalls` in `src/frontend/alpine/chat-types/core.ts:23` dispatches tool-call events into the new store, mutating the same key on status change.
- [ ] `event: tool_result` replaces the block with the result payload (no full message bubble swap).
- [ ] Status transitions `pending → running → done/error` reflect in the rendered `<span class="status">` without losing the prior arguments.
- [ ] Cancellation surfaces as `status === 'error'` with an inline message.
- [ ] Existing tool-call endpoints (`PATCH /api/tools/:id/valves`, etc.) untouched.

**Description:**

Add a new partial and an Alpine component that the SSE consumer mounts in place of the current generic `<div class="stream-update">` for tool-call events.

New partial — `src/partials/chat/tool-call-block.html`:

```html
<div class="tool-call-block" x-data="toolCallRender($store.toolCalls[seq])"
     x-init="mount(seq)">
  <header><span x-text="tool"></span>
          <span class="status" x-text="status"></span></header>
  <pre class="arguments" x-text="JSON.stringify(arguments, null, 2)"></pre>
  <pre class="result" x-show="status === 'done'" x-text="result"></pre>
</div>
```

The Alpine component (`src/frontend/alpine/chat-types/tool-call-render.ts`) keeps a single `toolCalls` store keyed by sequence number. The actual server payload (see `src/generation/generate-route/stream-to-client.ts:147`) is `{ type: "tool_call", toolCall: { id: string, function: { name: string, arguments: string } } }` -- no `status` field. The component derives status from event sequence: `pending` on `tool_call` arrival, `running` on the next `tool_call` re-emit for the same id (idempotent dedupe), `done` on `tool_result`, `error` on cancel. The Alpine `toolCallRender(seq)` factory reads `toolCalls[seq]` and exposes `tool = tc.function.name`, `arguments = tc.function.arguments`, `status = derivedState`. Subsequent updates flip the same key, so Alpine x-data mutates in place -- no re-render, no full stream reswap.

The SSE sequence handlers already exist server-side (`src/generation/generate-route/stream-to-client.ts:146–154`); the replay path is already plumbed through `src/generation/stream-buffer.ts`. New code is purely frontend + a thin partial.

**Acceptance Criteria:**

- [ ] New partial `src/partials/chat/tool-call-block.html` exists and is referenced when the consumer detects an `event: tool_call`.
- [ ] New Alpine component `src/frontend/alpine/chat-types/tool-call-render.ts` exposes a `toolCallRender(cell)` factory consumable from htmx-rendered chat HTML via `x-data`.
- [ ] `_streamToolCalls` in `src/frontend/alpine/chat-types/core.ts:23` dispatches tool-call events into the new store, mutating the same key on status change.
- [ ] `event: tool_result` replaces the block with the result payload (no full message bubble swap).
- [ ] Status transitions `pending → running → done/error` reflect in the rendered `<span class="status">` without losing the prior arguments.
- [ ] Cancellation surfaces as `status === 'error'` with an inline message.
- [ ] Existing tool-call endpoints (`PATCH /api/tools/:id/valves`, etc.) untouched.

**Notes:**

- htmx page-swap is **not** used for tool-call blocks; they are Alpine-managed islands. The surrounding message bubble stays in htmx territory for text tokens.
- A small store on `Alpine.store('chat')` keeps the keys; do not put them on `window`.
- Keep the partial ≤ 30 lines; all logic lives in the Alpine component.

**References:**

- loop-lore `src/frontend/alpine/chat-types/core.ts:23` — `_streamToolCalls` consumer (entry point for the new dispatch)
- loop-lore `src/generation/generate-route/stream-to-client.ts:146–154` — existing SSE `tool_call` / `tool_result` emitters (no server change required)
- loop-lore `src/generation/stream-buffer.ts` — replay buffer so reconnects preserve tool-call lifecycle
- loop-lore `src/views/chat.html` — host page that loads the new partial via htmx for the message bubble shell
- open-webui `src/lib/components/chat/Messages/structuredOutput.ts:194–236` — `buildToolCallToken` to-display conversion
- open-webui `src/lib/components/chat/Messages/ResponseMessage.svelte` — block rendering pattern


git issue: 5d52578
