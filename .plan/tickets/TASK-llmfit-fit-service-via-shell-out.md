<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: llmfit fit service via shell-out

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-model-rankings-history
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Hardware fit verdicts via llmfit process-level integration: which-llmfit detection, fit --json per (hw fingerprint, model, ctx) cache with estimate_basis/confidence, degrade to no-fit-data never a guess. Spec: .tmp/research/llmfit/10-synthesis.md Phase 2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
