<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: harden(telemetry): gate or rate-limit anonymous POST /api/v1/telemetry/event writes

**Status:** Done
**Status Note:** fixed 2026-10-25 (commit d91375860, branch fix/bug-sweep) — took the ticket's "per-IP limiter" acceptance arm: POST /api/v1/telemetry/event is gated by the existing per-IP sliding-window createRateLimiter (src/middleware/rate-limit.ts) at 30 events/min per IP, checked BEFORE record(); blocked requests return 429 + X-RateLimit-* + Retry-After (auth rateLimitHtml convention) and the response schema now declares the 429. Auth semantics unchanged (no 401 branch added; solo-mode pre-auth beacons keep working). The 8 KiB event_data cap was already in place, so anonymous flood is now bounded per IP on both bytes and rows. Pinned in src/routes/telemetry.test.ts (burst > budget → 429, telemetry_events row count stops at budget).
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-rate-limiting

**Summary:**

Sources: stream-c #12. Where: src/routes/telemetry.ts:54-79 (no 401 branch; schema declares 401 it never returns); src/middleware/csrf.ts:23-34 (explicit CSRF exemption). Gap: event ingestion requires neither auth (userId/sessionId nullable-passed, unlike the adjacent admin-gated analytics routes) nor CSRF, and shows no rate limiter - any client, including anonymous ones in multi-user mode, can grow telemetry_events unboundedly. Acceptance: auth is required when auth.required=true (solo-mode pre-auth beacons keep working), or a per-IP limiter plus payload/row caps bounds anonymous writes; anonymous flood no longer grows the table without bound. Priority: medium - unauthenticated unbounded row-growth vector in multi-user mode.

**Context:**

Anonymous telemetry writes were unbounded per IP: the handler had no auth branch and no rate limiter, so any client (including anonymous ones in multi-user mode) could grow telemetry_events without limit. The fix takes the ticket's "per-IP limiter" arm and leaves the auth semantics untouched.

**Resolution:**

- src/routes/telemetry.ts — the handler checks the per-IP sliding-window limiter (createRateLimiter, 30 events/min) BEFORE record(); over-budget requests answer 429 + X-RateLimit-* + Retry-After and the response schema now declares the 429.
- src/routes/telemetry.test.ts — pins the burst: requests past the budget answer 429 and the telemetry_events row count stops at the budget.
- Commit d91375860 (branch fix/bug-sweep).

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue c48fd6c (registry tip: e5100ef70 Konstantin Fedotov Close issue)
