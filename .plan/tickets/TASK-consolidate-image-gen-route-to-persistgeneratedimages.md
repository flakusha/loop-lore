<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Consolidate image-gen-route to persistGeneratedImages

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen

**Summary:**

Two parallel code paths for the same operation. image-gen-route.ts:162-205 inlines createAsset+linkAsset per image instead of using persistGeneratedImages. persistGeneratedImages (persist-generated.ts) is the shared generation→asset persistence contract. Fix: image-gen-route should delegate to persistGeneratedImages, or the contract should be extended and both callers updated.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
