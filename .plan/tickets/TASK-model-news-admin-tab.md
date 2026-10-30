<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: model news admin tab

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-model-rankings-history
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Admin triage tab for model news: partial + Alpine module on the existing admin page, read plus acknowledge/dismiss per-item state. No downloader wiring in first slice. Spec: .tmp/research/llmfit/10-synthesis.md Phase 3, 05-repo-recon.md sections 2.3-2.5.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
