<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: scene to importable Godot glTF bundle

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-game-asset-pipeline-export
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-game-asset-pipeline-export.md. Smallest ticket: one scene (background plus 2 entities plus dialogue) to importable Godot/glTF bundle; acceptance opens in engine. Entity fields that must survive export vs chat-only TBD in ticket. Caveats: lossy material export, engine-version drift, bundle reproducibility.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
