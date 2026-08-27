<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `/api/admin/audit` returns `selectAll()` rows but `AdminAuditRow` schema omits `meta`/`user_id`/`request_id`/`session_id` → `parseOr` strict fallback → empty audit list

**Status:** ✅ Resolved (already fixed in code: explicit `.select([...])` projection matches `AdminAuditRow` schema; `q` capped at 200 chars; both list and detail handlers updated)
**Severity:** Medium
**Priority:** medium
**Effort:** Small
**Area:** admin, frontend, audit, validation
**Epic:** epic-frontend-admin
**Tags:** admin, audit, frontend, typebox, parseOr, validation
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-admin-auxtelemetry-leaks-userid-chatid.md` (same admin projection mismatch), `TASK-epic11-admin-settings-reconciliation.md` (admin settings epic), `epic-logging-telemetry.md` (log_entries schema source)

## Summary

`GET /api/admin/audit` (`src/routes/admin/audit.ts:34-55`) runs
`selectAll()` on `log_entries`. The response row schema
`AdminAuditRow` (`src/validation/schemas/responses-admin.ts:56-66`)
declares only `{id, level, message, module, event_type,
entity_type, entity_id, created_at}` — explicitly omitting `meta`,
`user_id`, `request_id`, `session_id`. The frontend
`admin-audit.ts:32` parses the response through
`parseOr(AdminPaginatedEnvelope(AdminAuditRow,), ...)` which is a
**strict TypeBox check**: extra fields cause schema failure and the
fallback (`EMPTY_ADMIN_AUDIT`) is returned. Admins see an empty
audit log despite rows existing.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/routes/admin/audit.ts` | 34-55 | `selectFrom("log_entries").selectAll()` — returns every column |
| `src/routes/admin/audit.ts` | 96-100 | Same pattern on `audit/:id` |
| `src/db/migrations/005_utility_tables.ts` | 28-45 | `log_entries` columns: `id`, `level`, `timestamp`, `time`, `message`, `module`, `user_id`, `session_id`, `request_id`, `meta`, `event_type`, `entity_type`, `entity_id`, `action`, `created_at` |
| `src/validation/schemas/responses-admin.ts` | 56-66 | `AdminAuditRow` schema — missing `user_id`, `session_id`, `request_id`, `meta`, `timestamp`, `time`, `action` |
| `src/frontend/alpine/admin-audit.ts` | 32 | `parseOr(AdminPaginatedEnvelope(AdminAuditRow,), await res.json(), EMPTY_ADMIN_AUDIT,)` — strict check |
| `src/frontend/alpine/validation.ts` | 51-66 | `parseOr` returns `fallback` on schema mismatch; logs `console.warn` |

Auth: `can(ctx.userRole, "admin.system")` at
`src/routes/admin/audit.ts:19` ✓.

## Impact

- **Functional bug, not security**: not a data leak (the strict
  fallback prevents extra fields from reaching the UI). But the
  admin sees an empty audit list and may falsely conclude that
  nothing is being logged.
- **`console.warn` noise**: every page load emits
  `"parseOr: schema mismatch"`. The warning tells the operator
  nothing about which fields mismatched.
- **Affects `audit/:id` too**: the same `selectAll()` is used for
  single-row detail (`src/routes/admin/audit.ts:96-100`), so the
  per-entry view is also broken for the same reason.
- **TypeBox strictness is intentional elsewhere**: this is the
  trade-off — strict schemas catch drift but block legitimate
  over-fetching. The right fix is to project the columns, not
  loosen the schema.

## Fix

1. **Narrow the backend projection** at
   `src/routes/admin/audit.ts:34-55` and `:96-100` to match the
   `AdminAuditRow` schema exactly. Use an explicit `.select([
   "id", "level", "message", "module", "event_type",
   "entity_type", "entity_id", "created_at", ])`.
2. **If `meta` / `user_id` are operationally useful**, expand
   `AdminAuditRow` to include them (single source of truth for
   the wire shape). Coordinate with the FE admin-audit.ts
   template to render the new fields.
3. **Cap `q` LIKE query length** (`src/routes/admin/audit.ts:50-53`):
   bound `q` to ≤ 200 chars to prevent LIKE-DoS on `message`
   column.
4. **Default ordering**: already `created_at desc` — keep.
5. **Test**: seed 5 `log_entries` rows; `GET /api/admin/audit`
   returns 5 rows that pass `parseOr(AdminAuditRow)`; no
   `console.warn` in the test environment.

## Verification

- Unit: `audit.ts:34-55` projection narrowed; schema match.
- Integration: insert a log row, GET as admin, response body
  passes `parseOr(AdminAuditRow)` without fallback; `console.warn`
  not emitted.
- Manual: open DevTools → Network as admin, hit
  `/api/admin/audit`; response body shape matches schema; rows
  appear in the audit table (no empty list).

## Acceptance Criteria

- [ ] `selectAll()` replaced with explicit projection matching
      `AdminAuditRow` columns
- [ ] Same fix applied to `audit/:id` detail handler
- [ ] If `meta` / `user_id` are added to the wire response,
      `AdminAuditRow` schema updated and `admin-audit.html`
      template updated to render them
- [ ] `q` query param length-capped at 200 chars
- [ ] Test: schema match, no `console.warn`, rows render
- [ ] `bun run check` + `bun test src/routes/admin/audit.test.ts` + `src/validation/` green