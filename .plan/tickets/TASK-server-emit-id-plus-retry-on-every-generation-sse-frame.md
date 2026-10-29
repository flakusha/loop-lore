<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: server: emit id plus retry on every generation SSE frame

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-realtime-transports
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

HarnessReuse Group-1 server slice (T2): emit `id:` + `retry:` on every generation SSE frame so browser and terminal resume works.

**Ground state:** `GET /api/v1/generation/stream/:chatId` via `src/generation/controller.ts:95-98` → `handleGenerationStream` in `src/generation/generation-routes/stream.ts:27-141` replays `buffer.replay(replayFrom)` (`:67`), subscribes live (`:78-110`), keepalive (`:113-119`). Frames at `:70` and `:86` emit `event:`/`data:` only — never `id:`. `Last-Event-ID` is parsed at `:48` (`parseIntOr(lastEventId, 0)`); replay is reachable only by hand-set header (test at `stream.test.ts:130` hides this). `StreamBuffer.replay(from)` is `sequence >= from` (`src/generation/stream-buffer.ts:87-93`) with sequences starting at 0. Companion client work: T1 (TUI stream row) is already covered by the broad parity ticket; T3 shared chunk-reader is folded into T1 here — see skipped table. Distinct from `TASK-2026-openwebui-sse-reconnect-replay` (web-client reconnect + status probe, explicitly no server change).

**Adopt/adapt/defer:** ADOPT the spec ground truth for `id:`/`retry:`/`Last-Event-ID` — WHATWG SSE §9.2.3–9.2.4 (https://html.spec.whatwg.org/multipage/server-sent-events.html) + MDN Using_server-sent_events (https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events): server sets `id:` per event, client echoes `Last-Event-ID`, server replays after that ID; `retry:` sets the reconnect delay; `204` stops reconnect. Two-line server change (`id: ${sequence}` + `retry: 3000` per frame) unblocks browser AND terminal resume. DEFER `eventsource-parser`/`eventsource-client` deps (inert until the server emits `id:`).

**Acceptance criteria:**

- [ ] Each frame in `handleGenerationStream` carries `id: <buffer sequence>` and the stream carries `retry: 3000`.
- [ ] Existing `Last-Event-ID → replay` path unchanged and covered by a test that reads the `id:` off a first response and resumes with it (no hand-set header).
- [ ] Browser clients gain resume with zero client changes.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
