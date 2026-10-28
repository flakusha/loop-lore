<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Scene reuse propagation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-scene-environment-world-generation
**Tags:** scene, lineage
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Regeneration propagation UI: stale consumer markers (from the lineage propagation policy) plus one-click refresh-scene-from-updated-assets (regenerates only derived layers, re-validates the manifest). AC: updating a prop asset marks consuming layouts stale; refresh produces a new layout revision linked by lineage; the original layout remains retrievable.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
