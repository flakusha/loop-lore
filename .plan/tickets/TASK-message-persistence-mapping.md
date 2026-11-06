<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: message persistence mapping

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Persist harness turns as Messages rows: assistant rows with tool_calls/thinking; tool_result rows with MessageContentType.ToolResult and metadata.tool_call_id; map ACP session/update notifications to SSE frames. Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Context:**

The ACP path produced a turn and delivered its text, then dropped it: no row, no tool call, no reasoning. The chat kept nothing of a harness turn, and the frontend had nothing to render for a tool call the harness reported.

Constraints:
- The rows must be readable by the existing message readers (`src/routes/messages/helpers.ts` parses `tool_calls` and the tool-result `metadata`), so the harness writes the SAME shapes the LLM path writes instead of inventing a parallel format.
- A turn is one unit: the assistant row and its tool-result rows land in ONE transaction.
- A replayed turn must not duplicate rows — the `idempotency_key` column already exists for this.
- SSE frames are best-effort; the rows are the record.

Alternatives considered:
- A separate `harness_runs` table: rejected — the chat timeline already renders message rows, and a second store would need its own read path in the frontend.
- One row per tool call with the text inlined: rejected — the frontend renders tool results as child rows under the assistant row (the LLM path's shape), so the parent/child rows are kept.
- Streaming the rows while the turn runs: deferred — a turn can be cancelled mid-flight, and the LLM path also writes at the end.

Implementation:
- `src/integrations/harness/acp-session-update.ts` — narrows the raw `session/update` payload to the four persisted variants.
- `src/integrations/harness/turn-transcript.ts` — the per-turn collector.
- `src/integrations/harness/turn-persistence.ts` — the row writer (assistant row + one `tool_result` row per finished call, one transaction, idempotent on `harness:<profile>:<turnKey>`).
- `src/integrations/harness/turn-sse.ts` — the transcript-to-SSE frame mapping.
- `src/integrations/harness/turn-sink.ts` — the (chat, actor, profile) binding of rows + frames; `registerHarnessDriver` takes it optionally.
- The fake ACP server grew one knob (`FAKE_EVENTS`) that emits arbitrary `session/update` payloads before the reply chunk.

**Review (self-review before landing, 2026-11-06):**

Blocking findings, fixed before landing:
- The `tests - coverage gaps` gate FAILED — two new exports (`isTerminalToolStatus`, `emptyTurnTranscript`) were imported by no test file. Both are now covered by real assertions (the ACP terminal set: `completed`/`failed` end a call, `pending`/`in_progress` do not; the empty transcript equals an empty collector).
- The idempotency key was unreachable: the bridge never passed a turn key, so every turn wrote a fresh one and the dedupe path could never fire. The bridge now passes the bridge's per-send idempotency key (`message.idempotencyKey`, spec §4.3) as the turn key; a retried send writes ONE set of rows (seam test: both turns delivered, one assistant row).

Fixed while reviewing:
- A tool result with neither content blocks nor raw output stored the literal string `null` as its body; it now stores an empty body.
- The concurrent-replay path (the `messages (chat_id, idempotency_key)` UNIQUE index, migration 045) surfaced a raw constraint violation. The writer now reuses the routes' `findByIdempotencyKey` / `isIdempotencyUniqueViolation` helpers: the race loser replays the winner's row instead of failing.

Deviations / notes:
- Nothing in production constructs a sink yet — the harness has no production bridge registration in `src/`, so this is a proven SEAM: the rows do not land in a user's chat until the production dispatch path (TASK-harness-production-dispatch-path-runturn-caller-tasktype-mem) wires one.
- Encryption follows the shared helper, exactly as the LLM path does: `none` → plaintext, `standard` → server-encrypted (`key_id` set), `at-rest` → stored verbatim (server-generated content, the same trade the LLM path makes).
- The turn's tool-call rows are children of the assistant row (`parent_id`), unlike the LLM path where the assistant row does not exist yet — the ACP turn is written after the fact, so the id is known.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-11-06 registry-driven close: git issue caaa1f2 (registry tip: 574546311 Konstantin Fedotov Close issue)
