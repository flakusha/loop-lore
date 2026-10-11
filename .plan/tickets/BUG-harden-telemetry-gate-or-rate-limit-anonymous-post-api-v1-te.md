<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: harden(telemetry): gate or rate-limit anonymous POST /api/v1/telemetry/event writes

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** auth-config-contracts

**Summary:**

Sources: stream-c #12. Where: src/routes/telemetry.ts:54-79 (no 401 branch; schema declares 401 it never returns); src/middleware/csrf.ts:23-34 (explicit CSRF exemption). Gap: event ingestion requires neither auth (userId/sessionId nullable-passed, unlike the adjacent admin-gated analytics routes) nor CSRF, and shows no rate limiter - any client, including anonymous ones in multi-user mode, can grow telemetry_events unboundedly. Acceptance: auth is required when auth.required=true (solo-mode pre-auth beacons keep working), or a per-IP limiter plus payload/row caps bounds anonymous writes; anonymous flood no longer grows the table without bound. Priority: medium - unauthenticated unbounded row-growth vector in multi-user mode.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
