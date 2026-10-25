<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Settings export endpoint has no rate limiting

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — settings export is rate limited: `exportLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 })` (src/routes/settings.ts:25), consumed by the export handler at :220-223 with a 429 on denial.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-rate-limiting

**Summary:**

The GET /api/v1/settings/export endpoint (src/routes/settings.ts:212-230) generates a ZIP of all user data on every request with no rate limiting or caching. Impact: A user or automated script can spam this endpoint to generate large ZIPs repeatedly, exhausting CPU and memory. Fix: Add a per-user or per-IP rate limiter (e.g. 1 per minute).

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): settings export is rate limited: `exportLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 })` (src/routes/settings.ts:25), consumed by the export handler at :220-223 with a 429 on denial.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 283539d (registry tip: eeed17fd6 Konstantin Fedotov Close issue)
