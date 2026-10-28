<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Bevy export profile

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-game-asset-pipeline-export
**Tags:** export, bevy
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Bevy-safe export profile honoring bevy_gltf extension gaps (no Draco/meshopt/KHR_animation_pointer/KHR_gaussian_splatting; KTX2/WebP caveats): uncompressed glTF profile with an enforced extension allowlist plus AssetProcessor consumption docs. AC: profile-validated bundles contain only bevy_gltf-supported extensions (validation is a hard gate, not a warning); docs reference the current Bevy extension table.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
