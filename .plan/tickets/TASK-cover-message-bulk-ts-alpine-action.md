<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Cover message-bulk.ts Alpine action

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

src/frontend/alpine/chat-actions/message-bulk.ts sits at ~27% under the diff-scoped coverage gate: Alpine selection/toolbar action wiring needs a live DOM + Alpine runtime to exercise. The bulk routes underneath are covered at 98% by bulk.test.ts route tests. Floor the file with a dom-bound per-file waiver until Playwright DOM-coverage lands, then retire it with real interaction tests.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
