<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-openwebui-cancel-generation-wiring: Wire `cancelGeneration()` Alpine Method to SSE Abort Endpoint

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Labels:** frontend, streaming, generation
**Summary:** Wire the existing `cancelGeneration()` stub in `src/frontend/alpine/chat-types/core.ts:261` to the already-implemented server endpoint `DELETE /api/generation/cancel/:chatId` at `src/generation/generation-routes/cancel.ts`, then close the SSE `EventSource` and reset `isGenerating`.

**Context:** The stop button in the chat composer is already rendered in `src/views/chat.html:40–46` and its `x-on:click` handler resolves to `window.cancelGeneration()`. The server side is fully shipped — `src/generation/generation-routes/cancel.ts` accepts the chat ID, aborts the active generation, and the stream emits `stream-error` when the LLM task is terminated. The Alpine method, however, is currently a no-op stub at `src/frontend/alpine/chat-types/core.ts:261`.

Open-webui implements the same wiring in `open-webui/src/lib/components/chat/Chat.svelte:99–100` (`stopTasksByChatId` API call + abort signal). Loop-lore adapts the pattern to its Alpine + htmx stack: dispatch `fetch` then close the SSE connection.

**Acceptance Criteria:**

- [ ] `cancelGeneration()` in `src/frontend/alpine/chat-types/core.ts:261` performs `DELETE /api/generation/cancel/:chatId` with the current chat ID.
- [ ] After the request resolves (success or failure), `isGenerating` is set to `false` and the `EventSource` returned by `connectGenerationSSE` is closed.
- [ ] The chat composer stop button in `src/views/chat.html:40–46` triggers the wired method, and clicking it stops an in-flight stream within 1 s.
- [ ] A user-visible "Generation cancelled" status line replaces the spinner.
- [ ] On cancel, the SSE stream emits `stream-error` (assert via existing handler) and the partial message bubble is preserved as the cancelled draft.
- [ ] Cancel button is hidden when `isGenerating` is already `false` (existing toggle; do not regress).

**Description:**

Replace the stub body so that `cancelGeneration()` performs the three steps below in order, with `try/finally` to guarantee the local state resets even if the network call fails.

Existing stub at `src/frontend/alpine/chat-types/core.ts:261`:

```typescript
cancelGeneration() {
  // TODO: wire to DELETE /api/generation/cancel/:chatId
}
```

Replace with:

```typescript
async cancelGeneration() {
  const chatId = Alpine.store('chat').currentChatId;
  try {
    await fetch(`/api/generation/cancel/${chatId}`, { method: 'DELETE' });
  } finally {
    this.isGenerating = false;
    this.eventSource?.close();
    this.appendStatus('Generation cancelled');
  }
}
```

The `eventSource` reference is the one opened by `connectGenerationSSE` in the same file. The composer button in `src/views/chat.html:40–46` already invokes the method, so no template changes are required. The SSE will surface `stream-error` after the abort, and the chat view's existing error rendering path picks it up.

**Acceptance Criteria:**

- [ ] `cancelGeneration()` in `src/frontend/alpine/chat-types/core.ts:261` performs `DELETE /api/generation/cancel/:chatId` with the current chat ID.
- [ ] After the request resolves (success or failure), `isGenerating` is set to `false` and the `EventSource` returned by `connectGenerationSSE` is closed.
- [ ] The chat composer stop button in `src/views/chat.html:40–46` triggers the wired method, and clicking it stops an in-flight stream within 1 s.
- [ ] A user-visible "Generation cancelled" status line replaces the spinner.
- [ ] On cancel, the SSE stream emits `stream-error` (assert via existing handler) and the partial message bubble is preserved as the cancelled draft.
- [ ] Cancel button is hidden when `isGenerating` is already `false` (existing toggle; do not regress).

**Notes:**

- The `DELETE` endpoint already exists and is unauthorized-only to the chat owner; no server change is required, only invocation.
- Closing the `EventSource` is what causes the SSE to actually terminate locally; the server-side abort is what stops the LLM token emission.
- Keep the method `async` and the cleanup in `finally`; partial failures (e.g. network drop) must still reset the UI flag.

**References:**

- loop-lore `src/frontend/alpine/chat-types/core.ts:261` — existing `cancelGeneration()` stub to replace
- loop-lore `src/generation/generation-routes/cancel.ts` — server `DELETE /api/generation/cancel/:chatId` endpoint
- loop-lore `src/views/chat.html:40–46` — stop button + `x-on:click` handler in the composer
- loop-lore `src/frontend/alpine/chat-types/core.ts` (top) — `connectGenerationSSE` returning the `EventSource` whose `.close()` we rely on
- open-webui `src/lib/components/chat/Chat.svelte:99–100` — `stopTasksByChatId` API call + abort signal pattern


git issue: 4037476
