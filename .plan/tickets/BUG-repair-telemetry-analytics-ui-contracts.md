<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Repair telemetry analytics UI contracts

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-analytics-observability
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
**Context:** Existing admin UI bindings and the telemetry API disagree; repair these contracts before expanding usage analytics.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Repair the existing admin telemetry analytics UI/API contract before expanding usage analytics.

## Defects

- B1: Purge Old omits the required `confirm=PURGE` token, so the handler returns 400.
- B2: Summary returns only `total`; Sessions and Active Users bind missing distinct counts.
- B3: Daily analytics returns only event counts; Active Users binds a missing field.
- B4: Recent Errors binds `id` and `session_id`, but the privacy-preserving projection returns neither. The response schema also requires a nonexistent `id`.

## Acceptance Criteria

- [ ] Purge request includes `days=90&confirm=PURGE`; component regression asserts both query values.
- [ ] Summary returns server-only `total`, `distinct_sessions`, and `distinct_users`; seeded duplicates and frontend-source rows prove the counts.
- [ ] Daily rows include server-only `active_users`; repeated users count once per day.
- [ ] Error rows retain the narrow projection (`event_type`, `source`, `created_at`, `occurrences`), expose no session/content identifiers, and use a stable composite Alpine key.
- [ ] `bun test src/routes/telemetry.test.ts src/frontend/alpine/admin-analytics.test.ts` passes.

## Related

- Open WebUI usage-statistics research C0 (2026-11-24)
- `src/routes/telemetry.ts`
- `src/frontend/alpine/admin-analytics.ts`
- `src/components/admin/analytics-panel.html`
- `src/validation/schemas/telemetry.ts`

