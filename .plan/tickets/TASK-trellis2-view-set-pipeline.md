<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TRELLIS2 view-set pipeline

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-3d-generation
**Tags:** 3d, comfyui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Operator workflow for TRELLIS.2/Pixal3D from a single image or a view set through the workflow library; multi-image conditioning; PBR outputs linked as resource attachments. Check in one tested `{{var}}` mesh workflow JSON and load it through the existing `loadComfyUIWorkflow` seam (`src/generation/workflow-loader/convenience.ts:22-39`) — a mesh workflow is configuration, not a new provider. Use `ComfyUIProvider.runWorkflowFiles()` (`src/generation/providers/comfyui.ts:286-296`) for kind-tagged mesh/texture/thumbnail outputs; persist with the `assetType`-parameterised path (`persistGeneratedImages`), recording workflow hash, node-pack pin and weights directory as reproducibility stamps. AC: end-to-end stubbed-ComfyUI test asserts the submitted graph carries the expected inputs (uploaded sources, camera info when provided); output model plus textures persist as assets with lineage to sources; PBR maps land as linked image assets; default workflow uses only clean-licence nodes (`TASK-fence-3d-workflow-node-licenses`).

**Context:**

Research 2026-11-18 step 1: the softfork already carries the inference nodes
(`custom_nodes/ComfyUI-GGUF/nodes/{triposg,trellis2}.py`); the missing piece is
loop-lore wiring. Cheapest end-to-end proof, no Blender and no honkbox.

**Acceptance Criteria:**

- [ ] One `{{var}}` workflow JSON checked in and loaded through `loadComfyUIWorkflow`
- [ ] `runWorkflowFiles` kind-tagged outputs persisted as `model3d` + linked PBR images
- [ ] Reproducibility stamp (workflow hash, node-pack pin, weights dir) recorded
- [ ] Default workflow passes the licence gate test
