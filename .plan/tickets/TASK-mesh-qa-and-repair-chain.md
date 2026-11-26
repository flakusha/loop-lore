<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Mesh QA and repair chain

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-3d-generation
**Tags:** 3d, mesh
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Tier-1 QA report (watertight, degenerate faces, poly budget) plus repair/decimate/UV/PBR bake actions (ComfyUI native nodes preferred, Blender background-mode external step where needed), each recorded as lineage edges. AC: a deliberately holed mesh is reported (hole count) and repaired (watertight) with before/after assets linked; Blender absence degrades to ComfyUI-native-only actions with the gap surfaced.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Engine research addendum (2026-11-25)

- This is the first production caller for local or hosted Blender steps: owner-scoped run, external job/bundle ids, request/result digests, failure/cancel/restart and real mesh acceptance.
- No silent backend failover, skipped required stage or success asset on a failed run; honkbox-side execution stays honkbox-owned.
- Evidence: engine integration and full-cycle promotion maps, 2026-11-24/25.
