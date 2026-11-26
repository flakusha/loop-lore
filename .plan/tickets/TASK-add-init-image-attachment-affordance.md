<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Add init-image attachment affordance

**Status:** Done
**Scope:** Init-image backend plumbing plus UI affordance
**Priority:** medium
**Effort:** Medium

**Summary:**

Give operators a user-facing way to attach or select the img2img init image, complementing the approved backend init-image plumbing.

**Context:** TASK-img2img-init-image-plumbing covers the backend field only. TASK-comfyui-parameter-form-renderer covers generic image parameters; neither owns the init-image affordance.

**Acceptance Criteria:**

- [ ] UI exposes init-image selection on the img2img path.
- [ ] Selected image is sent through the backend field and survives a round trip.
- [ ] Test covers attach, clear, and missing-image cases.

**Caveats:** TOCTOU: image upload must complete before submit. Security: existing upload authorization and size limits apply. Authorization: asset ownership enforced server-side. Parallelism: isolated UI test. Partial failure: clear selection on submit failure. Rollback: remove the affordance. Observability: upload errors surfaced in UI.

**Resolved:** 2026-11-19 registry-driven close: git issue 4d84a63 (registry tip: 381e29a20 Konstantin Fedotov Close issue)
