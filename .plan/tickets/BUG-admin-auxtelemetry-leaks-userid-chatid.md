<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `/api/admin/telemetry/aux` returns `userId` + `chatId` + raw `error` string per AUX call — no scoping, no hashing

**Status:** ⬜ Not Started
**Severity:** Medium
**Priority:** medium
**Effort:** Small
**Area:** telemetry, admin, pii
**Epic:** epic-analytics-observability
**Tags:** telemetry, aux-pipeline, admin, pii, observability
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-telemetry-errors-leaks-raw-event-data.md` (same telemetry surface), `BUG-telemetry-purge-unbounded-days.md` (same route group), `src/aux-pipeline/runner.ts:91-106` (emitter)

## Summary

`GET /api/admin/telemetry/aux` returns rows from `telemetry_events`
joined with the parsed `event_data` JSON for `aux.call` events. The
response shape exposes `userId`, `chatId`, and a raw `error` string
on every event. There is no per-user scoping, no time-window
default, no hash for the actor identifier, and no error-string
redaction.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/routes/admin/aux-telemetry.ts` | 56-177 | Route handler — entire function |
| `src/routes/admin/aux-telemetry.ts` | 73-79 | `selectFrom("telemetry_events").select(["id", "event_data", "chat_id", "user_id", "created_at",])` — already narrowed but still includes `user_id`, `chat_id` |
| `src/routes/admin/aux-telemetry.ts` | 91-105 | Parses `event_data` JSON; builds `AuxTelemetryRow` with `userId`, `chatId`, `error: typeof data.error === "string" ? data.error : null` |
| `src/routes/admin/aux-telemetry.ts` | 142-146 | Response shape — `events[]` carries `userId`, `chatId`, `error`; `aggregates[]` per-task rollup |
| `src/routes/admin/aux-telemetry.ts` | 149-172 | TypeBox response schema declares `userId`, `chatId`, `error` fields — no redaction |
| `src/aux-pipeline/runner.ts` | 91-106 | Emits `aux.call` events with `userId`, `chatId`, `data: { task, model, provider, latencyMs, success, promptTokens, completionTokens, error }` |
| `src/routes/admin/aux-telemetry.ts` | 44-45 | `DEFAULT_LIMIT = 50, MAX_LIMIT = 500` — `MAX_LIMIT = 500` is high for a single response |
| `src/routes/admin/aux-telemetry.ts` | 67-70 | `limit` parsed from query with `Math.min(Math.max(Number(query?.limit,) || DEFAULT_LIMIT, 1,), MAX_LIMIT,)` — no row-level scoping |

Auth: `can(ctx.userRole, "admin.system")` at line 58 ✓.

## Impact

- **Actor PII in admin browser**: every AUX call event in the last
  N rows includes the raw user_id and chat_id of the requester.
  Combined with the response's `error` field (which can echo
  provider error messages), admins see user activity + transient
  failure context.
- **Provider-error leakage**: `error: typeof data.error ===
  "string"` (line 100) carries whatever the runner stored.
  Provider errors frequently include prompt fragments or model
  identifiers that map back to user behavior.
- **No time window default**: without `?since=`/`?until=` query
  params, the response is "the most recent N rows" — a single
  default-unbounded admin call can pull a full slice of AUX
  activity since the table was created.
- **Aggregates still link to userId in the underlying rows**:
  even if the response is later trimmed, the raw rows are
  accessible per-row.

## Fix

1. **Replace `userId` with `actorHash`** (HMAC-derived stable
   token). Same secret rotation as
   `BUG-telemetry-errors-leaks-raw-event-data.md`. Maintain
   cross-event correlation without exposing raw user IDs.
2. **Replace `chatId` with `chatHash`** for the same reason —
   AUX task context correlates chats, but the raw ID is not
   needed.
3. **Redact `error` string**: strip URL params / paths / known
   PII patterns (e.g. `Bearer <token>`, `key_id`, `nonce`),
   truncate to ≤ 200 chars, return a fixed `errorCategory`
   enum (`"timeout" | "rate_limit" | "schema_validation" |
   "auth_failure" | "other"`) instead of raw text.
4. **Default `?since=24h` and `?until=now` window**; reject
   `since > 7d` (max lookback). If no `since` provided, default
   to last 24 hours; document.
5. **Lower `MAX_LIMIT` to 100** (down from 500); add a
   `?aggregate_only=true` mode that returns just the per-task
   aggregates without per-row events.
6. **Persist a row-level `nsfw_classification`** (separate
   concern, mentioned for cross-ticket) — but for this fix,
   only project columns the schema explicitly declares.

## Verification

- Unit: `aux-telemetry.ts:73-105` returns rows with `actorHash`
  + `chatHash` (length 16 hex), no raw user_id/chat_id; `error`
  redacted to `errorCategory` enum; `limit` capped at 100;
  `since > 7d` returns 400.
- Integration: seed AUX events with raw user_id; admin GET returns
  hashed IDs and redacted errors.
- Manual: as admin, hit `/api/admin/telemetry/aux?limit=500` →
  400 (over cap). Without `?since=` → defaults to last 24h.

## Acceptance Criteria

- [ ] `userId` → `actorHash` (HMAC), `chatId` → `chatHash`
      (HMAC) in wire response
- [ ] `error` redacted; `errorCategory` enum replaces raw text;
      truncation ≤ 200 chars
- [ ] Default `?since` = 24h; `?since > 7d` returns 400
- [ ] `MAX_LIMIT` reduced to 100
- [ ] `?aggregate_only=true` mode supported (aggregates only, no
      events array)
- [ ] Tests: hashing, redaction, window default, limit cap
- [ ] `bun run check` + `bun test src/routes/admin/aux-telemetry.test.ts` green