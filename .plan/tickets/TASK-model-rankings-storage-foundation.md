<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: model rankings storage foundation

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-model-rankings-history
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Append-only model_rankings + ranking_snapshots store: migration 082, DOMAIN_MAP registration, messages.model_id index, snapshot cron job. Spec: .tmp/research/llmfit/10-synthesis.md Phase 1, schema sketch in 03-loop-lore-integration.md section 6. Epic: epic-model-rankings-history.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
