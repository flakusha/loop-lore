<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Lineage propagation policy

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-asset-lineage-provenance
**Tags:** assets, lineage
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

When a source asset regenerates (emotion avatar re-roll, view set extended), compute and expose downstream consumers (scenes, 3D models, engine exports that consumed it) via lineage rows and GET /assets/:id/usage backlinks, with an explicit stale/refresh marker per consumer. Query and surfacing only, no auto-regeneration (that is the 3D loop with user confirmation). AC: regenerating an avatar that fed a view set marks derived 3D assets stale in the usage listing within one write; no consumer is silently mutated; lineage cycles are rejected.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
