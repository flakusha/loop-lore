<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-openwebui-thinking-block-render: Collapsible Thinking/Reasoning Block Rendering

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Labels:** frontend, streaming, thinking
**Summary:** Render SSE `event: thinking` payloads as a `<details class="thinking-block">` prepended to the streaming message bubble. Collapse by default when the response finishes; honor the character-level `thinking_visibility` setting to decide whether the block is rendered at all.

**Context:** Loop-lore already emits `event: thinking` on the SSE stream from `src/generation/generate-route/stream-to-client.ts:127–131` and the consumer registers a handler in `_streamContent` at `src/frontend/alpine/chat-types/core.ts:23`. The buffer (`src/generation/stream-buffer.ts`) carries the events for replay. The frontend currently renders thinking tokens into the same bubble as regular text — there is no separate collapsible region.

Open-webui groups reasoning tokens as a separate visual block via `GROUPABLE_OUTPUT_TYPES` (`open-webui/src/lib/components/chat/Messages/structuredOutput.ts:85–92`) and renders them inside `ResponseMessage.svelte`. Loop-lore adopts the same separation in its Alpine + htmx stack.

**Acceptance Criteria:**

- [ ] `event: thinking` payloads populate a separate `thinking[]` array per streaming message in `Alpine.store('chat')`.
- [ ] The chat message partial renders `<details class="thinking-block">` above the response body, populated from `thinking.join('')`.
- [ ] The block is open during streaming and collapses (sets `<details>.open = false`) when the SSE emits `stream-complete`.
- [ ] When the active character's `thinking_visibility === 'hidden'`, the block is never rendered.
- [ ] After reconnect, replayed thinking events land in the same `thinking[]` array (reuses the existing sequence-keyed de-dup in `src/generation/stream-buffer.ts`).
- [ ] The body text and thinking block never interleave: body only shows `body` tokens, thinking only shows `thinking` tokens.

**Description:**

In the SSE consumer (`_streamContent` at `src/frontend/alpine/chat-types/core.ts:23`), route `event: thinking` payloads into a separate per-message `thinking` array on the Alpine store, distinct from the `tokens` array. When the streaming message bubble mounts (existing htmx swap path), render a `<details class="thinking-block">` ahead of the response body, populated from `thinking`.

Bubble shape in `src/views/chat.html` (or the relevant chat-message partial):

```html
<article class="msg" x-data="{ open: !isDone }">
  <details class="thinking-block" x-show="thinking.length" x-bind:open="open">
    <summary>Thinking</summary>
    <pre x-text="thinking.join('')"></pre>
  </details>
  <div class="body" x-text="body"></div>
</article>
```

On `event: stream-complete` (already handled by `src/frontend/alpine/chat-types/core.ts` elsewhere), set `open = false` so the block collapses for finished responses.

If the active character has `thinking_visibility === 'hidden'`, the component never writes to `thinking[]`, so the `<details>` element stays unmounted (`x-show` is false from the start).

The character-level setting is read from the existing `character.thinking_visibility` column (already in schema per current chat character loaders).

**Acceptance Criteria:**

- [ ] `event: thinking` payloads populate a separate `thinking[]` array per streaming message in `Alpine.store('chat')`.
- [ ] The chat message partial renders `<details class="thinking-block">` above the response body, populated from `thinking.join('')`.
- [ ] The block is open during streaming and collapses (sets `<details>.open = false`) when the SSE emits `stream-complete`.
- [ ] When the active character's `thinking_visibility === 'hidden'`, the block is never rendered.
- [ ] After reconnect, replayed thinking events land in the same `thinking[]` array (reuses the existing sequence-keyed de-dup in `src/generation/stream-buffer.ts`).
- [ ] The body text and thinking block never interleave: body only shows `body` tokens, thinking only shows `thinking` tokens.

**Notes:**

- Use the browser's native `<details>` element — no custom disclosure widget.
- Do not migrate to Svelte; the chat view stays htmx + Alpine.
- The character's existing `thinking_visibility` value is read once on chat open and stored on the Alpine component's state; no per-event lookup.

**References:**

- loop-lore `src/generation/generate-route/stream-to-client.ts:127–131` — existing `event: thinking` SSE emission
- loop-lore `src/generation/stream-buffer.ts` — buffer that replays thinking events on SSE reconnect
- loop-lore `src/frontend/alpine/chat-types/core.ts:23` — `_streamContent` where new dispatch is wired
- loop-lore `src/views/chat.html` — host page; chat-message partial renders the new block
- open-webui `src/lib/components/chat/Messages/structuredOutput.ts:85–92` — `GROUPABLE_OUTPUT_TYPES` defines reasoning as a separable group
- open-webui `src/lib/components/chat/Messages/ResponseMessage.svelte` — separate reasoning block rendering


git issue: b4145d9
