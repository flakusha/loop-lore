<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: moderation domain service (consolidate audit writes, shared scoring)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-lifecycle-moderation
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

DDD recommendation 4 (Medium impact, Medium risk). Consolidate audit writes in src/nsfw/moderation-service/audit.ts; chat moderation delegates; remove duplicate scoring in moderation-hook.ts by calling shared service. Duplicated today: applyFlag (src/chat/moderation.ts) writes moderation_actions + log_entries; moderation-service (audit.ts, flags.ts, appeals.ts) duplicate audit writes; moderation-hook.ts (generation/hooks) does flag detection with divergent severity scoring. Soft-delete audit preservation (moderation-service/data.ts) and dual-admin reversal (appeals-reversal.ts) invariants must survive.

Acceptance: single audit-write path used by chat moderation + service + hook; one severity-scoring function shared; audit-preservation + dual-reversal invariants pinned by tests; bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
