# BUG: Auto-gen streaming path: unhandled rejection + abort never wired to provider stream

**Status:** ✅ Complete (2026-09-01 — dev da05302e)
**Priority:** high
**Effort:** Medium

## Summary

src/generation/auto-gen/call-llm.ts:121 — .then() without .catch (unhandled rejection if processStreamingChunk throws); throwIfAborted() inside detached .then throws into discarded promise and never aborts the callWithFailover stream (no AbortController wired). Repetition/policy auto-cancel silently ineffective on auto-gen path. Also tracking?.attemptId ?? '' disables detection silently instead of failing loud.

## Resolution (audit — claim partly stale, defects real)

The abort chain itself IS wired: `processStreamingChunk` cancels via
`cancelGeneration()`, which aborts the tracker `AbortController` whose signal
reaches the providers through `genReq.signal`; all three providers observe it
and return `finishReason: "cancelled"`. Fixed in da05302e:

- call-llm: detector promise `.catch` (no more unhandled rejections); dead
  `throwIfAborted()` removed; chunk handler now guards on
  `abortSignal.aborted` and stops accumulating/rendering post-cancel;
  untracked streaming (greeting) warns loudly and skips the detector
  instead of silent `attemptId: ""` no-ops.
- providers/registry `callWithFailover`: a throw while the request signal is
  aborted no longer trips the circuit breaker or restarts generation on
  fallback providers — cancellation propagates as
  `GenerationCancelledError` (tracker reason preserved).
- generate-route/stream-to-client: the SSE path overwrote the tracker
  `providerReq.signal` with its own local controller, so user cancel never
  reached the provider stream; the tracker signal is now linked into the
  local controller. Same `.catch` detector hygiene.

Not in scope (own tickets): `cancel()` partial-content persistence on
stream-to-client; non-stream detector gap
(TASK-generation-error-handling-gaps-detector-abort-void-promises).

Tests: registry.test.ts, call-llm.test.ts, stream-to-client.test.ts
(cancel-vs-failure failover, post-abort stop, tracker-link done events).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
