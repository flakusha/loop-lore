<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: View-set consistency gate

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-view-set-generation
**Tags:** views, aux-pipeline
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Aux-pipeline VLM critique (src/aux-pipeline/runner.ts) scoring set consistency (same subject/wardrobe) with per-item verdicts; the gate can flag items for regeneration and runs off the request path. AC: a deliberately mixed set is flagged with the offending items identified; gate verdict stored as generation facts; gate failure degrades to unchecked, never blocks storage.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
