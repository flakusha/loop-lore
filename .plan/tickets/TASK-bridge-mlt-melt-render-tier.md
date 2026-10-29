<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Bridge MLT melt render tier

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-creative-tool-bridge
**Tags:** bridge, video, subprocess
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

MLT XML EDL generation + melt subprocess render — the headless video-editing backend for scenario assembly. LGPL-2.1 binary, capability-probed, timeout-bounded, provenance-stamped subprocess isolation (Blender bridge pattern); absent binary surfaces an exact error. AC: an EDL built from scene clips renders via melt; melt exit codes surface as run errors; provenance stamped on the output asset.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
