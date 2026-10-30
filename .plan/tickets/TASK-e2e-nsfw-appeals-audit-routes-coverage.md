<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: e2e: nsfw appeals + audit routes coverage

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-nsfw-moderation-priority
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Discovered while closing the e2e-gaps backlog rows. tests/e2e/flows/nsfw.test.ts covers block/ban/shadow round-trips, flags list reachability, and role gating (403/422) but asserts nothing about the appeals flow (src/routes/nsfw-moderation/appeals.ts — two-phase submit/review/execute with the dual-admin self-reversal block, unit-covered in src/routes/nsfw-moderation/appeals.routes.test.ts:297-374) nor the audit/export routes (src/routes/nsfw-moderation/audit.ts — GET /audit/:userId via requireModerationReview, GET+DELETE /export/:userId via the elevated requireAdminUsers capability with access-log rows written in-service). Acceptance: (1) e2e specs for appeals submit -> review -> execute including the self-reversal-block (executor == approving admin rejected); (2) e2e spec for the admin-gated audit export route; (3) keep the per-file-server resource contract in tests/e2e/helpers/server (random port, fresh client per test).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
