<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Settings export endpoint has no rate limiting

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-rate-limiting

**Summary:**

The GET /api/v1/settings/export endpoint (src/routes/settings.ts:212-230) generates a ZIP of all user data on every request with no rate limiting or caching. Impact: A user or automated script can spam this endpoint to generate large ZIPs repeatedly, exhausting CPU and memory. Fix: Add a per-user or per-IP rate limiter (e.g. 1 per minute).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 283539d (registry tip: eeed17fd6 Konstantin Fedotov Close issue)
