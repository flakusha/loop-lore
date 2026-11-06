<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: federation-peer-principal-kind

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-instance-federation

**Summary:**

Decide + implement how a peer instance appears in the shared principal model: a new `peer-instance` principal kind keyed on `mesh_peers.origin`, or a documented wire-tier alternative outside `PrincipalKind`. Research findings (2026-11-05 credential pass): no `PrincipalKind` exists for an instance; forcing peers into `internal-service` would misuse its actors-row binding (`internal-service` must map to `actor_type: "system"` so audit rows FK cleanly — `epic-principal-scoped-credentials.md:24`, `src/middleware/auth/authenticate.ts:108-116`), and a peer has no actors row. Peer admission today is `authorizePeerWork` (`src/federation/peer-work-auth.ts:8-44`, 6-layer fail-closed chain) on the federation app (`src/routes/federation-peer-work.ts:116-146`), bypassing the JWT seam entirely; the peer's only returned identity is its origin (`peer-work-auth.ts:63-67`). Goal: audit rows and budgets attribute to the peer origin (audit `user_id` NULL + origin column, rate-limit key = origin). Do NOT route peer calls through the JWT seam to fake a user.

**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Acceptance Criteria:**

- [ ] Decision recorded: `peer-instance` kind vs documented wire-tier alternative (with why `internal-service` doesn't fit)
- [ ] Peer facade/workload calls attribute audit + budget to `mesh_peers.origin`
- [ ] No fake-user JWT-seam routing for peers

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
