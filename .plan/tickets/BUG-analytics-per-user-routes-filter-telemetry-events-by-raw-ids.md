<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: analytics per-user routes filter telemetry_events by raw IDs but record() stores hashed IDs

**Status:** Done
**Priority:** high
**Effort:** Small
**Epic:** epic-analytics-observability
**Summary:** `GET /api/analytics/chat/:chatId` and `GET /api/analytics/overview` filter `telemetry_events` by raw IDs, but `record()` stores SHA-256-hashed IDs — per-user analytics always read zero in production.
**Context:** Found 2026-09-28 verifying the 2026-09-27 LLM execution-stats batch on dev HEAD `fbce2b129`. Proven: `hashId("test-chat-1") = "edf616455388"` != raw input.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Related:** BUG-telemetry-stores-raw-client-body-real-user-chat-session-ids (introduced the hashing), BUG-generation-completed-latencyms-hardcoded-to-0-on-two-emit-pa (sibling consumer of the same rows), TASK-admin-llm-execution-analytics-per-model-per-provider-rollups (rollup reads `event_data` fields — unaffected, but any per-user scoping there needs the same hashing)

## What

- `src/telemetry/service.ts:35-37` — `hashId()` truncates SHA-256 to 12 hex chars; `:88-95` stores `session_id`/`user_id`/`chat_id` hashed on every `record()` call. All four server emitters (post-store, non-stream, stream-to-client x2) flow through it.
- `src/routes/analytics.ts:66-70` (per-chat) and `:133-146` (overview) filter `.where("chat_id", "=", chatId)` / `.where("user_id", "=", userId)` with raw request values. The file imports nothing from `telemetry/service` (imports `:8-12`: Elysia, Kysely, sql, access, schema, date, schemas, http-utils).
- Consequence: every `generation.completed` / `generation.failed` row is invisible to both endpoints in production. Counts, token sums, `avgLatencyMs`, `costEstimate`, `failedGenerations` all read 0 — including for the latency/cost tickets that consume these fields.
- Tests mask it: `src/routes/analytics.test.ts:86-120` seeds rows via direct `db.insertInto("telemetry_events")` with raw `chat_id`/`user_id`, bypassing `record()` — green but unrepresentative of the real write path.
- Unaffected: admin endpoints in `src/routes/telemetry.ts:77-205` filter `source`/`event_type` only, no ID comparison — correct under hashing.

## Why

The 2026-09-27 batch (latency fix, failure context, cost attribution, llm-usage rollup) all assume per-user analytics read the rows `record()` writes. Without this fix every downstream number stays zero in production while tests stay green — the worst combination. Fix the join key first; the batch then measures truthfully.

## Scope

- Hash filter values with `hashId()` before querying in `src/routes/analytics.ts` (both endpoints, all three ID filters).
- Update `src/routes/analytics.test.ts` to seed via `record()` (or pre-hashed IDs); add one regression test asserting a `record()`-written completion round-trips to non-zero `totalGenerations`/`totalTokens` through the route.
- Out of scope: pricing table (sibling TASK), llm-usage rollup (sibling TASK — but any per-user scoping there copies this pattern), frontend dead-code BUG (sibling ticket).

## Acceptance Criteria

- [x] `record()`-written completion round-trips to non-zero `totalGenerations`/`totalTokens` through `GET /api/analytics/chat/:chatId`
- [x] Overview aggregates include `record()`-written rows
- [x] No raw IDs in new query code; `bun test src/routes/analytics.test.ts src/telemetry/` green

## Resolution

Fixed in `3db1ad353` — `hashId()` applied to all three `telemetry_events` ID filters in `src/routes/analytics.ts`: per-chat `chat_id` + `user_id`, and `user_id` for both the completed and failed overview aggregates. `checkChatAccess` keeps the raw `chatId`, which is correct: the `chats` table stores raw ids, confirmed by the access-denied test still returning 404.

Tests seed through the real write path (`record()`) for the round-trip cases and via pre-hashed ids elsewhere, so a raw-id regression fails: fails-before (3 red, 0 generations / 0 tokens) to passes-after (13 pass across `analytics.test.ts` + `src/telemetry/`).

Residual: rows written before `567247fff` (2026-09-06, which introduced write-side hashing) still hold raw ids and are now invisible to these endpoints. The window is bounded by the 90-day retention; the hashed-only filter is what the acceptance criteria require, and an unhashed fallback branch would defeat the anonymisation the writer guarantees.
