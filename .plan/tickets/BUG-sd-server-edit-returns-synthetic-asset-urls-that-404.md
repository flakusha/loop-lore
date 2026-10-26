<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: sd-server edit returns synthetic asset URLs that 404

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-comfyui-plugin
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

sdcppGenerate/sdapiGenerate/openaiGenerate edit-side (families.ts:72-80,129-137,174-182) + executeUpscale (ops.ts:206-213) return uid()+/api/assets/id/raw without createAsset/persistGeneratedImages — URLs 404. Fix: route through persistGeneratedImages or stop returning asset URLs.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 2b4cbf8 (registry tip: 19cff423c Konstantin Fedotov Close issue)
