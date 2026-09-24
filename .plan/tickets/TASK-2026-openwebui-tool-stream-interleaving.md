<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-openwebui-tool-stream-interleaving: Async Tool-Result Interleaving with SSE Backpressure

**Status**: open
**Priority**: high
**Labels**: generation, streaming, tools

## Summary

When the generation loop encounters tool calls, each tool result must be
enqueued into `StreamBuffer` as a `response.content_part.added` event
immediately after the `response.function_call_arguments.done` event that
triggered it. The ReadableStream controller drains the buffer with standard
backpressure. Round counter increments per batch, not per call.

## Context

Loop-lore's tool loop buffers all tool results in the current round and resumes
the stream only after every call has resolved. That hides latency when the
slowest tool is the rate-limiter and breaks the UX of seeing tool output
streamed as it arrives. Open-webui's `process_chat_response` writes each tool
result to the event emitter as soon as the call completes
(`middleware.py:5774–5783`), giving the UI real-time feedback.

## Description

Replace the current "collect then resume" pattern in `executeToolCalls`
(`src/generation/generate-route/tool-execution.ts:47`, `MAX_TOOL_ROUNDS=5`) with
progressive emission:

```ts
for (const call of toolCalls) {
  streamBuffer.append(StreamEventType.ResponseFunctionCallDone, call);
  const result = await invokeTool(call);
  streamBuffer.append(StreamEventType.ResponseContentPartAdded, result);
}
await streamBuffer.flush(); // backpressure-aware drain
rounds += 1;
```

The SSE consumer at `src/generation/generation-routes/stream.ts:73–84` already
drains via the ReadableStream controller — backpressure is automatic, no new
threading required. Rounds continue to be bounded by `MAX_TOOL_ROUNDS`; the
round counter increments once per batch, not per individual call, so a round of
3 parallel tool calls still counts as one round.

## Acceptance Criteria

- [ ] Each completed tool result emits a `response.content_part.added` event into `StreamBuffer` before the next tool in the same round starts.
- [ ] The `response.function_call_arguments.done` event for a tool precedes its corresponding `response.content_part.added`.
- [ ] Round counter increments once per batch (`MAX_TOOL_ROUNDS` still bounds total rounds).
- [ ] SSE consumer (`src/generation/generation-routes/stream.ts:73–84`) applies standard backpressure; no buffered-all-then-flushed behavior.
- [ ] Existing tool-flow integration tests continue to pass; new test asserts ordering of `function_call_arguments.done` → `content_part.added`.

## Notes

- Existing `executeToolCalls` callers do NOT need to change — the public signature stays the same.
- The `MAX_TOOL_ROUNDS=5` cap is preserved as-is. ponytail: no per-tool timeout; rely on the underlying fetch/SDK timeouts. Add a per-tool deadline if any tool routinely hangs.
- This ticket depends on TASK-2026-openwebui-stream-event-type-registry landing first (needs the typed event names).

## References

- loop-lore: `src/generation/generate-route/tool-execution.ts:47` — `MAX_TOOL_ROUNDS=5` cap.
- loop-lore: `src/generation/generate-route/tool-execution.ts:73–86` — current tool-loop body to rewrite.
- loop-lore: `src/generation/generation-routes/stream.ts:73–84` — ReadableStream drain loop.
- open-webui: `open-webui/backend/open_webui/utils/middleware.py:5774–5783` — per-result `event_emitter` writes inside the tool round.
