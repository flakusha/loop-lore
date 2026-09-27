<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: frontend generation.completed telemetry never reaches the server ingest union

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-analytics-observability
**Summary:** `trackTelemetry("generation.completed")` calls in `chat-generations.ts` never survive the ingest union — dead code on the wire, no double-counting risk but no client-side signal either.
**Context:** Found 2026-09-28 verifying the 2026-09-27 LLM execution-stats batch on dev HEAD `fbce2b129`.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Related:** BUG-analytics-per-user-routes-filter-telemetry-events-by-raw-ids (sibling ticket — server-side half of the same invisibility), TASK-telemetry-endpoint-trusts-userid-from-request-body (Done — confirms server-derived identity posture)

## What

- `src/frontend/alpine/chat-generations.ts:44` (stream-done) and `:114` (poll-completion) fire `trackTelemetry("generation.completed", { chatId })`.
- Drop 1 — shape: `trackTelemetry` only allowlists the event NAME on `CURATED_EVENTS`; the payload ships as `entry.meta` (`{ chatId, level }`) per `src/frontend/alpine/transports/telemetry.ts:86-92`. `TelemetryEventBody` has no `generation.completed` member with that shape — the closest (`src/validation/schemas/telemetry.ts:57-66`) requires `provider`/`model`/`promptTokens`/`completionTokens`/`latencyMs` under a `type` literal. Curated info events ship `{ type: <event-name>, data: meta }`, so validation rejects or drops them.
- Drop 2 — identity: even if the shape matched, `entry.meta` carries a raw `chatId`, but ingest derives `chatId` from `ctx.chatId` (`src/routes/telemetry.ts:59-66`) and nothing in `src/` ever populates `ctx.chatId` — no `.decorate()`/derive sets it (verified on dev HEAD). Frontend events would persist with `chat_id` NULL, invisible to per-chat analytics anyway.
- Net: both calls are dead code on the wire. No double-counting risk today — but also no client-side fallback signal if anyone assumes one exists.

## Why

The prior batch asked whether frontend completions double-count against server `generation.completed`. Answer: they cannot — they never land. Leaving dead telemetry calls invites a future "fix" that wires them up without hashing/validation and creates the double-count it was feared to be. Resolve explicitly: delete or legitimize.

## Scope

- Lazy default: delete both `trackTelemetry("generation.completed", …)` calls; no ingest-union change; confirm no test asserts the calls.
- Alternative (only if a client-side signal is wanted): add a first-class `frontend.generation_completed` member to `TelemetryEventBody` (provider/model optional, `chatId` server-derived) AND wire `ctx.chatId` derivation — both halves, with an ingest test proving the round-trip to `telemetry_events` with hashed IDs. Do not do the union half alone.
- Out of scope: server-side `generation.completed` emitters (sibling BUGs), per-user hash fix (sibling ticket).

## Acceptance Criteria

- [ ] Either both `trackTelemetry("generation.completed", …)` calls removed with no ingest-union change, or the new `frontend.generation_completed` shape round-trips through ingest to `telemetry_events` with hashed IDs
- [ ] No test asserts the removed calls; touched suites green
