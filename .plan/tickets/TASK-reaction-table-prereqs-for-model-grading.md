<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: reaction table prereqs for model grading

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-model-rankings-history
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Fix the two message_reactions endpoint defects (unique constraint, visibility filter) before anything scores the table. Spec: .tmp/research/llmfit/09-local-grading-via-reactions.md section 4.4. Blocks the reaction scorer ticket.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
