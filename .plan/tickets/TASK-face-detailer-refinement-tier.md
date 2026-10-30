<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Face-detailer refinement tier

**Status:** Not Started
**Priority:** low
**Effort:** medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, detailer, impact-pack, easy-use, kreaphoton, image-edit
**Caveats:** detector-weight acquisition, license fence, VRAM fence, probe-gated

**Summary:**

Detailer tier as workflow-library rows refining family base outputs
(impact FaceDetailer primary; easy-use detailerFix and KreaPhoton
FaceDetailer alternates). Detector weights are NOT on disk (`detection/`
empty — factpack-v2 §5): acquisition is in-AC with license + VRAM fences and
the rows stay hidden until the probe finds the detector model. AC: one wired
detailer row produces a detail-refined image linked to its source asset, with
acquisition documented and params typed.

**Context:**

impact-pack ships the SEGS framework (197 nodes); detailerFix rides
easy-use; KreaPhoton has its own FaceDetailer. Detailer = detect → crop →
re-denoise → paste; the base image rides the existing asset-id input path.
Authored as API-format library rows (the Phase-1 library already loads
API-format graphs) — no operator fixture exists for this tier.

**Acceptance Criteria:**

- [ ] Impact FaceDetailer row wired and runnable: base image (asset id) →
      detail-refined output, linked to the source asset.
- [ ] Detector model acquisition documented — file, source URL, license,
      VRAM estimate — and NOT assumed: row hidden until the probe finds it.
- [ ] Params typed (denoise, guidance/thresholds, max faces) per the
      param-map conventions; min/max enforced at the route layer.
- [ ] easy-use detailerFix and KreaPhoton FaceDetailer recorded as alternate
      rows (may land unchecked; the impact row is the acceptance carrier).

**Depends on:** TASK-comfyui-workflow-acceptance-probe-scaffold,
TASK-comfyui-parameter-map-derivation-from-marked-workflows
