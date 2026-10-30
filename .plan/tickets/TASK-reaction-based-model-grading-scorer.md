<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: reaction-based model grading scorer

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-model-rankings-history
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Beta-Binomial scorer over message_reactions linked via messages.model_id: per-message vote unit, admin-configurable positive valence set, periodic recompute cron, publish only at G>=30 with unranked-N-samples UI state, never averaged with imported opinion. Spec: .tmp/research/llmfit/09-local-grading-via-reactions.md sections 4.3/4.6.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
