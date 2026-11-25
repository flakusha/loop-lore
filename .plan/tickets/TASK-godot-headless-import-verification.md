<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Godot headless import verification

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-game-asset-pipeline-export
**Tags:** export, godot
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Godot target tier: project scaffolding plus a capability-probed godot headless import verification step, an EditorScenePostImport post-import script template, and an export-pack packaging recipe (Godot 4.x, MIT). AC: a valid bundle imports clean headless (or the tier reports the exact Godot errors); no Godot dependency required for core export (probe-gated tier); the template post-import script is documented.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Engine research addendum (2026-11-25)

- Pin Godot version, preset and templates; use explicit GLB interchange with negative import fixtures and deterministic re-import.
- Offline import evidence stays offline: no live run or asset-version claim until the shared identity gates land.
