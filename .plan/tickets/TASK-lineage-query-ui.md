<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Lineage query UI

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-asset-lineage-provenance
**Tags:** assets, lineage, gallery
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Queryable lineage graph over assets plus a per-asset source/derived listing and an open-lineage entry from preview. AC: an assets lineage section lists sources and derivatives; traversal over a multi-step chain returns the full graph.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
