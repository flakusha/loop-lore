<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Admin providers list endpoint is public

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

The GET /api/v1/providers endpoint (src/routes/admin/providers.ts:28-49) is marked 'No auth' and returns full provider health info including status, latency, and error messages. Impact: Unauthenticated reconnaissance of AI provider infrastructure. Fix: Require authentication or strip sensitive fields (status, error, latencyMs, lastChecked).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
