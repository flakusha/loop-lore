<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `DELETE /api/telemetry/analytics/purge` accepts unbounded `?days=` — admin can wipe instantly with `days=0`

**Status:** ⬜ Not Started
**Severity:** Medium
**Priority:** medium
**Effort:** Trivial
**Area:** telemetry, admin, dos, retention
**Epic:** epic-analytics-observability
**Tags:** telemetry, admin, retention, dos, validation
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-telemetry-errors-leaks-raw-event-data.md` (same route group), `TASK-rate-limiting-telemetry.md` (related observability ticket)

## Summary

`DELETE /api/telemetry/analytics/purge` accepts `?days=` from the
query string and uses it directly as the retention threshold. There
is no lower bound. An admin can pass `?days=0` to delete every row
where `created_at < now` (every row), or pass `?days=-1` to delete
nothing — both are unintended behaviors of an "admin" tool.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/routes/telemetry.ts` | 206-236 | `DELETE /api/telemetry/analytics/purge` handler |
| `src/routes/telemetry.ts` | 215 | `const retentionDays = Number(ctx.query.days,) \|\| 90;` — `Number("0")` is `0`, so the default 90 only kicks in for `undefined` / `NaN` |
| `src/routes/telemetry.ts` | 216 | `const cutoff = new Date(Date.now() - retentionDays * 86_400_000,).toISOString();` — `days=0` → cutoff = now → deletes all rows |
| `src/routes/telemetry.ts` | 218 | `await database.deleteFrom("telemetry_events",).where("created_at", "<", cutoff,).execute();` — runs unconditionally |
| `src/frontend/alpine/admin-system.ts` | 110-127 | `purgeAnalytics()` always passes `?days=90` — safe in current UI, but the API is wide open |
| `src/telemetry/cleanup.ts` | 15-26 | The auto-retention path (24h timer) is fine; this is the manual admin path |

Auth: `can(ctx.userRole, "admin.system")` at
`src/routes/telemetry.ts:207-208` ✓.

## Impact

- **DoS / observability DoS**: a single admin (or a compromised
  admin session) can wipe every telemetry row in one request. The
  next 24h cleanup loop will then have nothing to act on.
- **Audit-evasion**: if `log_entries` ever gains telemetry-style
  retention (currently it does not), this same pattern would let
  admins destroy their own history. Cross-ticket with
  `BUG-nsfw-moderation-delete-destroys-audit-log.md`.
- **No confirmation token**: the route executes immediately on a
  `DELETE` — no body, no confirmation string, no two-step
  preview/confirm flow.

## Fix

1. **Clamp `retentionDays` to `[1, 365]`** at the route. Reject
   `days=0`, negative, fractional, non-numeric, or `> 365` with a
   400. The lower bound of 1 day is the minimum useful retention;
   the upper bound prevents accidental year-long-keep changes.
2. **Require a confirmation token** in the request body (or as
   `?confirm=token`) for the purge action. Mirror the
   "PURGE" / "RESET" / "DELETE ALL" confirmation strings in
   `src/routes/admin/danger-zone.ts:59-65`. Mismatched
   confirmation → 400.
3. **Emit a `log_entries` row** before delete: `module:
   "telemetry", event_type: "admin", action: "telemetry-purge",
   user_id: ctx.userId, meta: { retentionDays, deleted: <count>
   }`. Provides post-hoc traceability.
4. **Return deleted count** in the response so the admin sees what
   they just did. Currently the response is `{ ok: true, purged:
   true }` with no count.
5. **Test coverage**: regression test that `?days=0` returns 400;
   `?days=-5` returns 400; `?days=400` returns 400; valid range
   works; missing `confirm` token returns 400.

## Verification

- Unit: `routes/telemetry.ts:206-236` rejects `?days=0` with 400
  and a clear error message; rejects `?days=-1` with 400;
  rejects `?days=400` with 400; `?days=30` + valid confirm →
  200 with `{ ok: true, purged: true, count: <N> }`.
- Integration: seed 100 telemetry rows; `?days=30 + confirm=...`
  removes only the rows older than 30 days; `log_entries` has the
  audit row.

## Acceptance Criteria

- [ ] `?days=` clamped to `[1, 365]`; out-of-range returns 400
- [ ] Confirmation token required; mismatch returns 400
- [ ] `log_entries` audit row written before delete (with admin id
      and retentionDays)
- [ ] Response includes `count` of deleted rows
- [ ] Tests: clamp boundaries, confirmation token, audit row
      emission
- [ ] `bun run check` + `bun test src/routes/telemetry.test.ts` green