<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-openwebui-retry-from-point: Structured Retry from Last Confirmed Output Step

**Status:** ⬜ Not Started
**Priority:** low
**Labels:** frontend, generation, retry

## Summary

Add a structured retry path: on generation failure the UI shows a "Retry" button. `retryFromPoint(attemptId, step)` (existing stub at `src/frontend/alpine/chat-types/core.ts:261`) calls a new server endpoint `POST /api/generation/retry` that replays any buffered content from `StreamBuffer` for the failed attempt and then resumes the generation. The SSE stream prepends already-confirmed content so the user does not see duplicates.

## Context

Loop-lore's frontend already exposes an unused `retryFromPoint` stub at `src/frontend/alpine/chat-types/core.ts:261`. The server-side `StreamBuffer` (`src/generation/stream-buffer.ts`) already records each step's confirmed output, so the resume path is mostly wiring. The missing piece is a `POST /api/generation/retry` endpoint that accepts `{ chatId, attemptId, fromStepIndex }`, replays buffered events up to that step, then asks the LLM driver to continue.

Open-webui implements a similar retry/resume in `open-webui/src/lib/components/chat/Chat.svelte`'s retry path. Loop-lore mirrors the contract in its htmx + Alpine stack.

## Description

Replace the stub at `src/frontend/alpine/chat-types/core.ts:261`:

```typescript
async retryFromPoint(attemptId, step) {
  const chatId = Alpine.store('chat').currentChatId;
  const res = await fetch('/api/generation/retry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chatId, attemptId, fromStepIndex: step })
  });
  this.isGenerating = true;
  this.eventSource?.close();
  this.eventSource = this.connectGenerationSSE(chatId);
}
```

Server — new file `src/generation/generation-routes/retry.ts`:

```typescript
// Pseudocode: server replays then reissues
router.post('/api/generation/retry', async ({ body }) => {
  const events = buffer.replay({ chatId, attemptId, fromStepIndex: body.fromStepIndex });
  for (const ev of events) streamToClient(ev);   // SSE prepending confirmed content
  return resumeGeneration({ chatId, attemptId, after: body.fromStepIndex });
});
```

The retry is owner-scoped (the existing auth middleware applies). On the wire, the user sees a brief replay of already-confirmed text, then the new tokens stream in. The chat view treats both as identical SSE events, so no UI change beyond enabling the button is required.

## Acceptance Criteria

- [ ] `retryFromPoint(attemptId, step)` at `src/frontend/alpine/chat-types/core.ts:261` POSTs to `/api/generation/retry` with `{ chatId, attemptId, fromStepIndex }`.
- [ ] New server file `src/generation/generation-routes/retry.ts` exposes `POST /api/generation/retry`, owner-scoped, returning `200` with a stream handle.
- [ ] The endpoint replays buffered events from `StreamBuffer.replay` from `fromStepIndex` forward, then calls the existing LLM driver to continue generation past that step.
- [ ] The frontend closes any existing `EventSource` and opens a new one via `connectGenerationSSE` before the retry completes; `isGenerating` flips back to `true`.
- [ ] The chat error path (when `event: stream-error` is received) renders a "Retry" button under the failed message bubble, calling `retryFromPoint` with the captured `attemptId` + last confirmed step index.
- [ ] No duplicate DOM rows appear during the replay (idempotent insertion keyed by sequence, same path used by reconnect).
- [ ] Retry is allowed at most 3 times per attempt (server-enforced) and surfaces a clear error past the cap.

## Notes

- This stays inside the existing Alpine + htmx stack; no Svelte migration.
- The chat error path bubble is the existing failed-message element; the new Retry button is an Alpine toggle, not a new view.
- The 3-retry cap is a server-side guard to prevent loops; keep this simple and enforce in `retry.ts`, not client-side only.
- `attemptId` is the existing generation-attempt identifier; reuse what `src/generation/` already emits in `event: stream-meta`.

## References

- loop-lore `src/frontend/alpine/chat-types/core.ts:261` — existing `retryFromPoint` stub to replace
- loop-lore `src/generation/generation-routes/` — new `retry.ts` for `POST /api/generation/retry`
- loop-lore `src/generation/stream-buffer.ts` — `replay({ chatId, attemptId, fromStepIndex })` returns the buffered events
- loop-lore `src/frontend/alpine/chat-types/core.ts` — `connectGenerationSSE` for the SSE reopen step
- open-webui `src/lib/components/chat/Chat.svelte` — retry/resume handlers pattern
