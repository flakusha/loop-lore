<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Guest rate limiting + audit logging for guest reads

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-guest-access.md

**Summary:**

## Problem

Rate limiting is per-route on auth routes only (src/routes/auth/shared.ts); guest reads are unthrottled and unaudited, so open-public endpoints are abuse/exposure vectors.

## Change

- Per-IP sliding-window limiter for guest-context read routes (reuse src/middleware/rate-limit.ts shape), configurable via config (guest read limit + window).
- Audit log rows for guest reads: userRole=guest + request id + route + target id; no invented identity.
- NSFW gate keeps denying anonymous (no guest-tier policy in this epic).
- Full token-bucket subsystem stays in epic-api-governance.md.

## Acceptance

- Guest reads beyond the per-IP limit get 429 with retry-after.
- Audit rows written for guest reads (log_entries or equivalent).
- Registered-user reads unaffected.
- NSFW gate still denies guest.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
