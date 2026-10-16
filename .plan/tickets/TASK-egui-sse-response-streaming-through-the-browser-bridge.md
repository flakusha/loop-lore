<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui SSE response streaming through the browser bridge

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-experimental-egui-frontend

**Summary:**

Stream LLM responses into the egui client over SSE, reusing the existing
htmx stream contract instead of inventing a second one.

Today (htmx): GET /api/v1/generation/stream/:chatId (registered
src/generation/controller.ts:95-98, handler
src/generation/generation-routes/stream.ts) emits stream-update (HTML chunks),
tool_call, stream-done, stream-error with text/event-stream, no-cache,
keep-alive, X-Accel-Buffering: no; reconnect replay is served by
src/routes/stream-buffer/. The Alpine consumer is
src/frontend/alpine/chat-generations.ts:23-93 (EventSource opened at :29, closed
by `_cleanupSSE` at :226-236). Four more streams already ship: activity
(src/routes/activity-stream.ts:113), notifications
(src/routes/notifications/stream.ts:97), world conditions
(src/routes/worlds/world-stream.ts:108) and emotion-avatar job progress
(src/routes/character-emotion-avatars-stream.ts:38).

Constraint: reqwest has no EventSource (seanmonstar/reqwest#2677, open;
reqwest-eventsource is unmaintained and mis-handles stream end), and wasm has no
SSE transport — so the stream MUST be consumed by the already-shipped JS bridge
(src/frontend/egui-bridge.ts, global window.loopLoreEgui) and handed to Rust.

egui target: a bridge-owned EventSource per stream kind, a Rust-side stream
handle fed by bridge callbacks, resume-from-replay on reconnect, and teardown
symmetry with the htmx consumers.

**Context:**

Parity target #2 of the egui roadmap in `epic-experimental-egui-frontend.md`
(2026-10-16), and the highest-risk one: a chat client that cannot stream is not
a chat client. The htmx consumer
(`src/frontend/alpine/chat-generations.ts:23-93`) is the reference behaviour:
EventSource opened on chat entry, `stream-update` chunks appended on arrival,
`tool_call` / `stream-done` / `stream-error` driving UI state, and
`_cleanupSSE` closing the source on leave. Two facts bound the design: reqwest
has no EventSource support (seanmonstar/reqwest#2677) and
`reqwest-eventsource` is unmaintained and mis-handles stream end, so a Rust SSE
transport is a liability, not an option; and the wasm target has no sockets at
all, so the already-shipped JS bridge (global `window.loopLoreEgui`) is the only
place an EventSource can live. Alternative considered — polling
`GET /api/chats/:chatId/messages` until the turn completes — is rejected: it
loses the incremental render that defines the htmx experience.

**Acceptance Criteria:**

- [ ] Tokens arrive in the egui composer/message area with the same latency
      class as htmx (chunk-on-arrival, no buffering to stream-done)
- [ ] Reconnect replays buffered events via the server's stream buffer instead
      of restarting the generation; `tool_call` / `stream-done` / `stream-error`
      drive the same UI states htmx shows
- [ ] Stream handles close on chat switch and on back-to-htmx (no leaked
      EventSource), mirroring the htmx cleanup
- [ ] The bridge owns the EventSource: no Rust SSE transport, no second
      implementation of the event contract
- [ ] Tests passing (bridge unit tests for open/close/relay; Rust-side handle
      tests for chunk ordering and terminal states)

**Resolved:** 2026-10-16 registry-driven close: git issue 746adba (registry tip: 7cc38a0f1 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-EGUI-SSE-RESPONSE-STREAMING)
