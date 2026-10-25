<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Admin providers list endpoint is public

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-auth-access

**Summary:**

The GET /api/v1/providers endpoint (src/routes/admin/providers.ts:28-49) is marked 'No auth' and returns full provider health info including status, latency, and error messages. Impact: Unauthenticated reconnaissance of AI provider infrastructure. Fix: Require authentication or strip sensitive fields (status, error, latencyMs, lastChecked).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue bf85b93 (registry tip: ff58548ac Konstantin Fedotov Close issue)
