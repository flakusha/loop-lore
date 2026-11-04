<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Dataset label-grade queue plus eval dashboard UI

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

04-learning build order needs: dataset queue (Argilla-pattern label/grade) + eval dashboard (RAGAS/OpenEvals scores) under Training/Admin. Curation/export UX before trainer wiring (Curator/Unsloth-Studio confirm). Research: metaapp-usages mode 4; frontend bucket 09.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
