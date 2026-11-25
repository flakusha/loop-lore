<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Matting via honkbox as first choice

**Status:** In Progress
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-avatar-alpha-vn-layering
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: resolveMattingProvider first choice, current factory order as fallback; PNG in and out, non-PNG named 400, unconfigured honest 501. Depends: honkbox T5 background-removal op.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## 2026-11-25 reconciliation

Shipped: `resolveMattingProvider` auto-prefers honkbox when the cached probe
advertises the matting sidecar, then comfy → rembg → http, with an explicit
backend always winning (`src/generation/matting/factory.ts:169-206`); PNG in
and out is enforced at `:83-118` (non-PNG input is converted with sharp,
non-PNG output rejected). Residual: the exact HTTP error contract in scope is
not shipped — unconfigured matting answers 400
(`packages/assets/src/assets/matting-routes.ts:176-180`, asserted at
`packages/assets/src/assets/matting-routes.test.ts:201-208`) instead of 501,
and non-PNG input is converted rather than named 400.
