<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Rig attach tier

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-3d-generation
**Tags:** 3d, rigging
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

OSS Rigify local rig attach (Mixamo-compatible skeleton config); glTF skins/animations preserved through the chain; animation assets attachable as resources. UniRig is GPL-3.0 (vendor LICENSE verified 2026-11-18) — quarantined, never vendored or a default; see `TASK-fence-3d-workflow-node-licenses`. AC: a rigged glb plays an animation in model-viewer; re-running the texture pass preserves the rig (no silent drop); rig step provenance recorded.

**Context:**

The 2026-11-18 licence audit corrected the inherited "UniRig MIT" premise:
`vendor/unirig/LICENSE` is GPL-3.0. Rigging is on-demand only (research
step 7) — never claim animation-ready for automatic retopo output.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
