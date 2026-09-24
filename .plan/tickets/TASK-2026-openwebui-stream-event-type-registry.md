<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-openwebui-stream-event-type-registry: Typed SSE Event Type Registry for Generation Stream

**Status:** open
**Priority:** high
**Effort:** Medium
**Labels:** generation, streaming, types
**Summary:** Replace the `string`-typed `type` field on `StreamBuffer.append()` and the SSE emitter with a typed `StreamEventType` const enum / literal union covering the full open-webui-style namespaced event vocabulary.

**Context:** Loop-lore's generation stream uses untyped strings for SSE event names. Open-webui defines a precise, namespaced event vocabulary (`response.*`, `chat:message:*`) that the Python `ChatCompletionMiddleware` emits throughout `event_emitter` and `process_chat_response`. Adopting the same vocabulary gives the frontend a stable contract and reduces silent drift between backend and frontend parsers.

**Acceptance Criteria:**

- [ ] New file `src/generation/stream-events.ts` exports `StreamEventType` const enum and `isStreamEventType` guard.
- [ ] `StreamBuffer.append()` (`src/generation/stream-buffer.ts:16`) uses `StreamEventType` for its `type` parameter.
- [ ] SSE emitter at `src/generation/generation-routes/stream.ts:65` emits typed `StreamEventType` values.
- [ ] `tsc --strict` clean (no new errors).
- [ ] `src/generation/stream-buffer.test.ts` continues to pass with no behavioral change.
- [ ] No runtime change to wire format.

**Description:**

Currently `StreamBuffer.append()` (`src/generation/stream-buffer.ts:16`) and the SSE emitter in `src/generation/generation-routes/stream.ts:65` accept `type: string`. Both call sites should switch to a typed symbol. New module `src/generation/stream-events.ts`:

```ts
export const enum StreamEventType {
  // open-webui-style namespaced events
  ResponseOutputItemAdded       = "response.output_item.added",
  ResponseContentPartAdded      = "response.content_part.added",
  ResponseContentPartDone       = "response.content_part.done",
  ResponseReasoningSummaryAdded = "response.reasoning_summary_part.added",
  ResponseFunctionCallDelta     = "response.function_call_arguments.delta",
  ResponseFunctionCallDone      = "response.function_call_arguments.done",
  ResponseCompleted             = "response.completed",
  ResponseFailed                = "response.failed",
  ChatMessageError              = "chat:message:error",
  ChatCompletion                = "chat:completion",
  // loop-lore legacy aliases retained for backward compatibility
  StreamUpdate                  = "stream-update",
  StreamDone                    = "stream-done",
  StreamError                   = "stream-error",
  ToolCall                      = "tool_call",
}
```

Each existing string literal at the cited call sites must be swapped for the
enum member; `tsc --strict` must report zero errors. No runtime/behavior change
is intended — `const enum` emits the same wire string. A small
`isStreamEventType(x: unknown): x is StreamEventType` guard should be exported
for the SSE parser boundary.

**Acceptance Criteria:**

- [ ] New file `src/generation/stream-events.ts` exports `StreamEventType` const enum and `isStreamEventType` guard.
- [ ] `StreamBuffer.append()` (`src/generation/stream-buffer.ts:16`) uses `StreamEventType` for its `type` parameter.
- [ ] SSE emitter at `src/generation/generation-routes/stream.ts:65` emits typed `StreamEventType` values.
- [ ] `tsc --strict` clean (no new errors).
- [ ] `src/generation/stream-buffer.test.ts` continues to pass with no behavioral change.
- [ ] No runtime change to wire format.

**Notes:**

- A `const enum` keeps the emitted string identical to the existing wire format;
  switch to a plain union of string literals if the project forbids `const enum`.
- Migration is intentionally additive — `stream-update` / `stream-done` /
  `stream-error` / `tool_call` aliases remain so existing frontend consumers
  keep working.
- Out of scope: actual adoption of the new `response.*` event names by the
  frontend. A follow-up ticket should mirror the typed enum in the chat UI
  parser.

**References:**

- loop-lore: `src/generation/stream-buffer.ts:16` — `StreamBuffer.append()` accepting `type: string`.
- loop-lore: `src/generation/generation-routes/stream.ts:65` — SSE emitter writing the `type` field.
- loop-lore: `src/generation/stream-buffer.test.ts` — existing coverage that must still pass.
- open-webui: `open-webui/backend/open_webui/utils/middleware.py:613–936` — `event_emitter` payloads (`response.*`, `chat:message:*`, `chat:completion`) defining the canonical namespace.


git issue: f55d4eb
