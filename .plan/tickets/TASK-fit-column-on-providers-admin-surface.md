<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: fit column on providers admin surface

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-model-rankings-history
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Surface fit verdicts on the existing providers admin surface: extend /admin/providers/:name/models and the rescan path with a fit column incl. confidence tier. No new route. Spec: .tmp/research/llmfit/10-synthesis.md Phase 2, 05-repo-recon.md sections 1.4-1.5.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
