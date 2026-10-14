<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Settings export endpoint has no rate limiting

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

The GET /api/v1/settings/export endpoint (src/routes/settings.ts:212-230) generates a ZIP of all user data on every request with no rate limiting or caching. Impact: A user or automated script can spam this endpoint to generate large ZIPs repeatedly, exhausting CPU and memory. Fix: Add a per-user or per-IP rate limiter (e.g. 1 per minute).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
