<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Interactive project binding

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-game-asset-pipeline-export
**Tags:** export, lineage
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

An interactive-project record binding a world/chat plus asset set plus export profile plus export history (lineage-linked), so re-exports are reproducible (pinned assets plus manifests). AC: re-export after source asset changes either pins the old version or explicitly advances (user choice recorded); export history is queryable; deleted pinned assets fail export with a precise report, never silently drop content.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
