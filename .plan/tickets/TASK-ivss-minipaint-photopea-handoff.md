<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS minipaint photopea handoff

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, frontend, editing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Self-hosted miniPaint iframe open-edit-save handoff plus an optional Photopea link (server.url save-back). AC: edit-in-miniPaint round-trips an asset into a new asset version with lineage (editor provenance recorded); iframe sandboxed; Photopea is an external service behind explicit user action.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
