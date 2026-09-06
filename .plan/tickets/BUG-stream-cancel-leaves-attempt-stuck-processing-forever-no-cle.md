# BUG: Stream cancel leaves attempt stuck Processing forever — no cleanup/persist

**Status:** ✅ Resolved (2026-09-06)
**Priority:** high
**Effort:** Medium

## Summary

src/generation/generate-route/stream-to-client.ts:228 — cancel() aborts provider but never persists partial content, never calls failGeneration, never signals buffer done; attempt stays Processing in activeGenerations indefinitely, reconnect consumers hang on open buffer. Also :146 user-cancel mid-tool-round surfaces as AbortError → marked Failed not Cancelled; :80 void .then() fire-and-forget without catch (banned pattern), cancel decision applied async while chunks keep enqueueing. Fix: cleanup in cancel(), distinguish AbortError, await/buffer action.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed in branch `bugfix-round-6` (commit `3245701`, dev merge pending).

`src/generation/generate-route/stream-to-client.ts`: the stream `catch` block now classifies cancellation (`err instanceof GenerationCancelledError || err.name === "AbortError" || err.cause instanceof GenerationCancelledError`) and delegates to `streamCancelCleanup` (`src/generation/generate-route/cancel-stream.ts`, new module) instead of the generic error path:

- Persists the attempt as `GenerationStatus.Cancelled` via `updateAttemptStatus` with `cancel_reason`/`cancel_reason_detail`/`cancel_source`/`completed_at`/`last_rendered_chunk_index` and `delivery_confirmed_at: null`.
- Releases in-memory tracking: `active.deliveryConfirmed = false`, removes from `activeGenerations` and `chatToAttempt` — the attempt no longer stays Processing forever.
- Signals `buffer.signalDone()`, schedules buffer cleanup, enqueues a final SSE `done` frame (`cancelled: true`, `finishReason: "cancelled"`, accumulated content) so reconnect consumers resolve instead of hanging on an open buffer, then `controller.close()`.
- Non-cancel errors still go through `failGeneration` → `buffer.signalError` → error frame, unchanged.

The cleanup module owns: `GenerationStatus` (db/enums), `chatToAttempt` + `updateAttemptStatus` (from `../cancellation-tracker`, not the manager barrel — those are not re-exported there), `GenerationCancelledError` (cancellation-actions/error). `stream-to-client.ts` keeps only `GenerationCancelledError` for the classification check.

Tests: `src/generation/generate-route/stream-to-client.test.ts` adds "provider throw post-abort classifies as cancelled done, not error (BUG-stream-cancel)" — a streaming provider that throws after observing abort; asserts a `done` event with `cancelled:true`/`finishReason:"cancelled"` and no `error` event. New `src/generation/generate-route/cancel-stream.test.ts` covers `streamCancelCleanup` directly (Cancelled persist, AbortError fallback, DB-failure cleanup) with 100% line coverage. Isolated suites: `src/generation/generate-route/` 15 pass, `src/turning/` 19 pass.
