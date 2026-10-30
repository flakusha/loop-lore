<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: False-report protection

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-nsfw-moderation-priority
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Discovered in the same epic-nsfw-moderation-priority reconciliation pass. Only reporter-PII hashing exists (reporterHash, src/routes/nsfw-moderation/flags.ts:8-10); there is no malicious-report handling — no report-rate thresholds, no reporter credibility signal, no appeal-triggered reporter review. Scope: design + minimal mechanism. Verified constraint: today every flag creation is authenticated — POST /api/nsfw/moderation/flags calls requireUserId (flags.ts:35, guard in src/routes/http-utils/errors.ts:162); there is no anonymous reporting path on this route, so any threshold/credibility mechanism must preserve the current authenticated contract and must not break anonymous external reporting if such a path is added later. Acceptance: (1) abuse-signal definition (thresholds/credibility model); (2) threshold behavior documented; (3) tests.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
