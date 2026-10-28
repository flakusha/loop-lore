<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: View-set camera conventions and export

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-view-set-generation
**Tags:** views, camera, 3d
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Camera JSON utilities: convention flag, OpenCV to OpenGL conversion, azimuth/elevation to prompt fragment helper (mirroring the ComfyUI camera-angle prompt semantics), COLMAP text-format and nerfstudio transforms.json export of a set for external reconstruction tools. AC: export of a 6-view set produces a COLMAP-parseable cameras/images pair and a nerfstudio-parseable transforms.json (round-trip tested against the published format specs); unknown convention values rejected.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
