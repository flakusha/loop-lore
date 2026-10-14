<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Content-hash naming for generated assets

**Status:** Not Started
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
