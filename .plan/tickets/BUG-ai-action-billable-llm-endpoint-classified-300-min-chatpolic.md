<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: ai-action billable LLM endpoint classified 300/min chatPolicy

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

`ai-action` is a billable LLM endpoint (auxiliary-model call) classified under the 300/min chatPolicy via first-match prefix.

**Files:**

- src/routes/messages/ai-action.ts:71-101 (aux-model `callAux` at :95-101)
- src/api-governance/rate-limiting/policies.ts:73 (`["/api/v1/chats", chatPolicy]` — 300/min, burst 50, first match wins)

**Evidence:**

- Executed `policyForRoute` (probe `scratch/probe-policy.ts`): route path `/api/v1/chats/:id/messages/:messageId/ai-action` resolves to `{"name":"chat","windowMs":60000,"max":300,"burst":50}` — UI-volume chat traffic, not `generationPolicy` (20/min, burst 5) — because the `/api/v1/chats` prefix rule wins first-match. The guard itself is active on this route (probe-governance.ts showed 429s on v1 paths) (review-surfaces.md S-5).
- Same defect class as the four prior rate-limit bugs documented inline at policies.ts:80-104 (each fixed by adding a suffix rule). New this week (`0a3dc3c4d` 2026-10-22).

**Fix:**

Add a suffix rule giving ai-action a generation-class budget (quick one-rule fix, consistent with the policies.ts:80-104 precedents). Quick standalone slice; broader perimeter coordination tracked under the api-governance epic.

**Related:** ace5536 (missing rate policies for actor image-gen/matte routes — same defect class, different routes).

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — review-surfaces.md S-5.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue d0ecf0a (registry tip: 23c6a51b4 Konstantin Fedotov Close issue)
