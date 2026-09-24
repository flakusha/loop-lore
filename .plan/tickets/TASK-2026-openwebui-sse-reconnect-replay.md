<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-openwebui-sse-reconnect-replay: SSE Reconnect with Last-Event-ID Sequence Replay

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Labels:** frontend, streaming
**Summary:** Persist the last SSE sequence number per chat in `sessionStorage` and on `EventSource` error/close reconnect with the `Last-Event-ID` header so the server replays buffered events via `StreamBuffer.replay(fromSeq)`. Reconcile `isGenerating` against the server's `/api/generation/status/:chatId` rather than a stale local flag.

**Context:** The server already accepts `Last-Event-ID` and replays buffered events: `src/generation/generation-routes/stream.ts:47` parses the header into a `fromSeq` and the underlying `src/generation/stream-buffer.ts` provides the replay API. The frontend opens a vanilla `EventSource` via `connectGenerationSSE` in `src/frontend/alpine/chat-types/core.ts` without state continuity; a transient network blip drops buffered tokens and confuses the `isGenerating` toggle. Open-webui's resilient reconnect pattern is in `open-webui/src/lib/components/chat/Messages/structuredOutput.ts:515–553` (event accumulation with persisted cursors) and the Chat.svelte SSE reconnect path.

Loop-lore adopts the same approach in its Alpine + htmx stack: persist sequence cursors client-side, send the `Last-Event-ID` header on reconnection, and verify state against a small REST probe.

**Acceptance Criteria:**

- [ ] `connectGenerationSSE` writes a per-chat `lastSeq` to `sessionStorage` after each successfully parsed SSE message.
- [ ] On `EventSource.onerror` or `onclose`, the component reconnects with a `Last-Event-ID` header derived from `sessionStorage`.
- [ ] The server replays any buffered events between the persisted sequence and the new server cursor without producing duplicate DOM rows (idempotent insertion keyed by sequence).
- [ ] After reconnect, `isGenerating` reflects the actual server state from a new `GET /api/generation/status/:chatId` probe (not just the local flag).
- [ ] Reconnect path is throttled (exponential backoff, capped at ~5 s) to avoid hot loops on permanent failures.
- [ ] `/api/generation/status/:chatId` returns `{ isGenerating: boolean, lastSeq: number }` and is owner-scoped.

**Description:**

Extend `connectGenerationSSE` in `src/frontend/alpine/chat-types/core.ts` so that:

1. After every successful SSE event the new method bumps `sessionStorage.getItem('loop-lore:gen:chat:{chatId}:lastSeq')` to the current `seq`.
2. On `EventSource.onerror` or `onclose`, the code reads the persisted sequence and reconnects with `new EventSource(url, { headers: { 'Last-Event-ID': lastSeq } })`. Use a native `EventSource` polyfill if header support is unavailable (Safari).
3. After the reconnect handshake, the component issues a one-shot `GET /api/generation/status/:chatId` and overwrites local `isGenerating` from the response.

Sketch:

```typescript
connectGenerationSSE(chatId) {
  const last = sessionStorage.getItem(`loop-lore:gen:chat:${chatId}:lastSeq`);
  const es = new EventSource(`/api/generation/stream/${chatId}`, { headers: last ? { 'Last-Event-ID': last } : {} });
  es.addEventListener('message', (e) => {
    const seq = JSON.parse(e.data).seq;
    sessionStorage.setItem(`loop-lore:gen:chat:${chatId}:lastSeq`, String(seq));
    // existing handlers...
  });
  es.addEventListener('error', () => this.reconnectAfter(chatId, es));
}
```

The server side already does the replay (`src/generation/stream-buffer.ts.replay(fromSeq)` and `src/generation/generation-routes/stream.ts:47`); no server change is required. The `/api/generation/status/:chatId` endpoint is added under `src/generation/generation-routes/status.ts` as part of this task.

**Acceptance Criteria:**

- [ ] `connectGenerationSSE` writes a per-chat `lastSeq` to `sessionStorage` after each successfully parsed SSE message.
- [ ] On `EventSource.onerror` or `onclose`, the component reconnects with a `Last-Event-ID` header derived from `sessionStorage`.
- [ ] The server replays any buffered events between the persisted sequence and the new server cursor without producing duplicate DOM rows (idempotent insertion keyed by sequence).
- [ ] After reconnect, `isGenerating` reflects the actual server state from a new `GET /api/generation/status/:chatId` probe (not just the local flag).
- [ ] Reconnect path is throttled (exponential backoff, capped at ~5 s) to avoid hot loops on permanent failures.
- [ ] `/api/generation/status/:chatId` returns `{ isGenerating: boolean, lastSeq: number }` and is owner-scoped.

**Notes:**

- `sessionStorage` is keyed per chat so multiple tabs do not share a value; this is intentional for the per-conversation cursor.
- Native `EventSource` in most browsers does not support custom headers; either use the `event-source-polyfill` (already in lockfile) or a thin `fetch` + `ReadableStream` SSE parser. Prefer the polyfill to avoid writing a parser.
- Idempotency for the replay is required or duplicate events appear; piggyback on any existing sequence-keyed de-dup (e.g. message-id) already used by the consumer.

**References:**

- loop-lore `src/frontend/alpine/chat-types/core.ts` — `connectGenerationSSE` (function to extend)
- loop-lore `src/generation/generation-routes/stream.ts:47` — existing `Last-Event-ID` parse entry point
- loop-lore `src/generation/stream-buffer.ts` — `replay(fromSeq)` server-side replay API
- loop-lore `src/generation/generation-routes/` — new `status.ts` for the probe endpoint
- open-webui `src/lib/components/chat/Messages/structuredOutput.ts:515–553` — event accumulation + persisted cursor pattern
- open-webui `src/lib/components/chat/Chat.svelte` — SSE reconnect on transient error


git issue: 7a625f4
