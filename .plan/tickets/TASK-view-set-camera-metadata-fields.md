<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: View-set camera metadata fields

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-asset-generation-metadata
**Tags:** assets, metadata, views, 3d
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Extend the generation-fact capture struct and metadata JSON schema with per-view camera facts: azimuth/elevation/fov, optional full intrinsics plus camera-to-world matrix with an explicit OpenCV-or-OpenGL convention flag (COLMAP/nerfstudio hybrid); seeds stored as strings; validation rejects unknown convention values. AC: a captured view-set asset exposes per-asset camera facts; convention round-trips losslessly (OpenCV c2w to OpenGL conversion tested both directions); seed values above 2^53 survive a parse-store-reserialize round-trip as exact strings.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
