<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `/api/telemetry/analytics/errors` exposes raw `event_data` JSON + `user_id`/`chat_id` to admin

**Status:** Done
**Severity:** High
**Priority:** high
**Effort:** Small
**Area:** telemetry, analytics, admin, privacy, security
**Epic:** epic-analytics-observability
**Tags:** telemetry, admin, pii, analytics, observability, ingestion
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-telemetry-purge-unbounded-days.md` (same route group), `BUG-admin-auxtelemetry-leaks-userid-chatid.md` (same PII surface), `TASK-rate-limiting-telemetry.md` (adjacent observability), `TASK-analytics-observability.md`

## Summary

`GET /api/telemetry/analytics/errors` returns `selectAll()` rows from
`telemetry_events` filtered by `event_type LIKE '%failed%'`. The raw
payload (`event_data` JSON, `user_id`, `chat_id`, `session_id`) flows
straight to the admin browser, where `admin-system.ts` stores the
unparsed response in `errorEvents` with **no `parseOr` TypeBox
validation** and renders only `session_id.slice(0,8)`. Because the
ingest endpoint accepts `t.Any()` payloads (`POST /api/telemetry/event`,
schema in `validation/schemas/telemetry.ts:17`), any future emitter or
client-supplied frontend event can stash raw text/PII into the JSON
blob, which then surfaces verbatim in the admin view.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/routes/telemetry.ts` | 129-164 | `/api/telemetry/analytics/errors` runs `selectAll()` on `telemetry_events` with `event_type LIKE '%failed%'` ORDER BY created_at DESC LIMIT 50 |
| `src/routes/telemetry.ts` | 144-146 | `.selectAll()` returns every column including `session_id`, `user_id`, `chat_id`, `event_data` |
| `src/validation/schemas/telemetry.ts` | 12-18 | `TelemetryEventBody.data = t.Record(t.String(), t.Any())` — ingest accepts any JSON payload |
| `src/routes/telemetry.ts` | 31-56 | `POST /api/telemetry/event` writes whatever the caller supplies |
| `src/frontend/alpine/admin-system.ts` | 90-109 | `loadAnalytics()` fetches `/api/telemetry/analytics/errors` and stores the raw response in `this.errorEvents` with **no `parseOr`** |
| `src/frontend/alpine/admin-system.ts` | 34 | `errorEvents: [] as { id: string; event_type: string; session_id: string \| null; created_at: string }[]` — TS hint narrowed, but runtime payload is unrestricted |
| `src/views/admin.html` | 1489-1494 | Renders only `e.session_id?.slice(0,8)` — but in-memory JS retains full payload including `event_data` |
| `src/generation/auto-gen/handle-generation-error.ts` | 27-34 | Emits `generation.failed` with `data: { error: (error as Error).message, chatId }` — admin sees raw `error.message` |

Auth: `can(ctx.userRole, "admin.system")` at `src/routes/telemetry.ts:130` ✓.

## Impact

- **Admin PII pivot**: any admin browser receives raw `user_id`,
  `chat_id`, `session_id` triples per failed event.
- **Indirect PII leak**: `event_data.error` (from
  `handle-generation-error.ts:32`) carries provider error strings that
  frequently echo back the LLM prompt fragment that caused the
  failure (timeouts, content-filter rejections, schema validation
  errors). Effectively a partial-prompt leak to admin.
- **Future-emitter drift hazard**: because `record()` (`src/telemetry/service.ts:42-52`)
  accepts arbitrary `Record<string, unknown>`, any new caller can
  stuff arbitrary text/PII into `event_data` and it surfaces here
  without redaction.

## Fix

1. **Project columns explicitly** at the route: replace
   `selectAll()` with `.select([
     "id", "event_type", "source", "created_at",
     eb.fn.count<number>("id",).distinct().as("occurrences",),
   ])`. Strip `event_data`, `user_id`, `chat_id`, `session_id` from
   the projection.
2. **Add a `parseOr` schema** for the response shape (mirror the
   pattern in `admin-audit.ts:32`) so future server-side payload
   additions don't silently widen the surface.
3. **Restrict by `source`** — only `source = 'server'` events should
   be returnable. Client-originated `frontend.*` events go through a
   separate `frontendErrors` endpoint that returns counts only.
4. **Tighten `POST /api/telemetry/event` ingest**: replace
   `t.Any()` with a typed per-`type` discriminator
   (`frontend.page_view → {path, referrer}`, `frontend.click →
   {selector}`, `frontend.error → {message, stackDigest}`). Reject
   events that try to set `user_id`/`chat_id`/`session_id` directly
   (those are server-derived from `ctx.userId`/`ctx.sessionId`/chat
   context).
5. **Hash actor identity** at the route level: replace `user_id`
   with a stable `actor_hash` so cross-event correlation is possible
   for ops but the raw user ID isn't exposed.
6. **Cap event_data size** at ingest (`safeJsonStringify` already
   truncates circular refs; add a byte cap).

## Verification

- Unit: `routes/telemetry.test.ts` covers `event_type LIKE
  '%failed%'` returns the narrowed projection; admin can no longer
  read `event_data` / `user_id` from this route.
- Integration: insert a `generation.failed` row with
  `event_data = '{"error": "leak-test-secret"}'` and confirm
  `/api/telemetry/analytics/errors` does not return the secret.
- Manual: open DevTools → Network, hit `/api/telemetry/analytics/errors`,
  confirm response body has no `event_data` / `user_id` / `chat_id`
  fields.

## Acceptance Criteria

- [ ] `selectAll()` replaced with explicit projection at
      `src/routes/telemetry.ts:144-152`; `event_data`,
      `user_id`, `chat_id`, `session_id` are no longer in the
      response
- [ ] `TelemetryAnalyticsErrorsRow` schema added and `parseOr`
      applied in `admin-system.ts:103`
- [ ] Response restricted to `source = 'server'`
- [ ] `POST /api/telemetry/event` rejects arbitrary `data`; typed
      per-`type` discriminators only
- [ ] `event_data` byte cap enforced (≤ 8 KiB)
- [ ] Regression test: secret in `event_data` not exposed
- [ ] `bun run check` + `bun test src/routes/telemetry.test.ts` + `bun test src/telemetry/` green