<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Content-hash naming for generated assets

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue f7527f0): src/assets/service/persist-generated.ts:63-65: filename stem is the SHA-256 of the bytes and populates content_hash (byte-identical re-run collapses to duplicate:true); test-backed at persist-generated.test.ts:133-135.
**Priority:** high
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen

**Summary:**

Generated images use UUID-based naming (generated-{assetId.slice(0,8)}.png) instead of content-hash. SHA-256 is computed in create.ts:28-30 but persistGeneratedImages hardcodes dedupe:false (persist-generated.ts:62), so content_hash is always NULL. The unique index uq_assets_owner_content_* never fires for generated assets. Fix: either use content hash as asset id/filename (removing dedupe:false) or populate content_hash for dedupe detection.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue f7527f0 (registry tip: d8fcf2dfe Konstantin Fedotov Close issue)
