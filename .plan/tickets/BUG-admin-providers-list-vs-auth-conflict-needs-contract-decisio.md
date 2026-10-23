<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: admin providers list-vs-auth conflict needs contract decision

**Status:** Not Started
**Priority:** critical
**Effort:** Medium
**Epic:** epic-auth-access
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Two fix branches take opposite strategies on GET /api/providers in src/routes/admin/providers.ts and cannot both land.

Evidence: admin-providers-list-public-fix flips the endpoint (registered under 'Public providers list (no auth)', providers.ts:131) to require admin.system, but dev suite describes it 'GET /api/providers (public, no auth)' with 'does not require authentication' (providers.test.ts:86-118); existing tests pass vacuously because makeApp derives userRole admin (providers.test.ts:26). admin-providers-auth-fix instead keeps it public and strips sensitive fields, but breaks its own guarded suite: providers.test.ts:333 requires status key, branch removes it (bun test --isolate: 19 pass / 1 fail).

Affected: branches admin-providers-list-public-fix, admin-providers-auth-fix; file src/routes/admin/providers.ts:128-136 and :29-33. No in-repo FE consumer (src/frontend uses /api/v1/providers).

Fix direction: decide the real contract for GET /api/providers (public-by-design with stripped fields vs admin-only). If public: keep status (derived server-side from health cache, no upstream text) and keep :333. If admin-only: add anonymous-401 test via makeAppWithRole(db, null). Land exactly one branch.

Acceptance Criteria:

- [ ] Documented contract decision for GET /api/providers (public vs admin-only)
- [ ] Exactly one of the two branches landed, other dropped
- [ ] providers.test.ts passes under bun test --isolate including a non-admin access case
- [ ] UNVERIFIED resolved: whether any deployment calls unauthenticated GET /api/providers

Report: .tmp/glm-review/2026-10-21/minimal-a.md (admin-providers sections).

Caveats: authorization boundary change; stale-state risk if external callers rely on public access; partial failure n/a; observability unchanged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
