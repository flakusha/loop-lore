<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: test debt: coordination-priority queue-cap regression test

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** research-agency-quality
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

coordination-priority-eviction-fix caps module-level queuedActions at 1000 (shift-evict oldest before push) but ships no regression test: coordination-priority.test.ts:54-99 covers queue/drain happy paths only. Module has zero production callers (unwired code), so regression risk today is nil, but the cap is unproven. Related feature task TASK-AGENCY-COORDINATION-PRIORITY (31b4d5d), not this debt.

Spec: mark intent pending, enqueue 1001 actions, assert __queueLength()===1000, then drainQueuedActions returns entries 2..1001 in FIFO order (proves shift dropped index 0). Failing-before: length reaches 1001.

Nits folded in: document global-LRU vs per-scene tradeoff at :93-94 (cross-scene flood evicts another scene's action while caller got status:queued); hoist UPPER_SNAKE MAX_QUEUED_ACTIONS.

Evidence: features section 1; 10 pass.

Acceptance Criteria:

- [ ] cap test added and failing-before verified
- [ ] eviction policy documented or ticketed
- [ ] suite green

Report: .tmp/glm-review/2026-10-21/features.md section 1.

Caveats: test-only; concurrency sound (sync check+shift+push, no await); no auth change.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
