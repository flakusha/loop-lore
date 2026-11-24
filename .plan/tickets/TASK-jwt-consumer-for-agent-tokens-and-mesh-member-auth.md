<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: JWT consumer for agent tokens and mesh member auth

**Status:** Blocked
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-auth-access
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: agent-token mint plus mesh-intel member auth against honkbox JWT verifier; negative paths pinned server-side, default-deny. No early build. Depends: honkbox T2 JWT bearer verification.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
