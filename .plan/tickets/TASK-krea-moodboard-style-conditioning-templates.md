<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Krea moodboard style-conditioning templates

**Status:** Not Started
**Priority:** low
**Effort:** medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, krea, moodboard, style-conditioning, workflow-library
**Caveats:** multi-image inputs, model deps verified at probe, probe-gated

**Summary:**

Style-conditioning rows from ComfyUI-Krea-Moodboards (KreaMoodboardApply /
Mashup / Style): one or more reference images condition the style of a family
generation row. Reference images ride the asset-id upload path; the row is
probe-gated incl. whatever vision model the nodes require — CLIP-vision
encoders are on disk, anything further is acquisition-in-AC with a license
fence. AC: a moodboard row runs N reference images + prompt → styled output
with typed multi-image params; probe hides the row when nodes/models are
missing.

**Context:**

Pack ships 10 nodes (Apply / Mashup / Random / Search / Style + browsers).
Style seam of the builtin templates per factpack-v2 §7; no `.plan/` coverage
exists (dedupe table). Composable with any UNET-loader family row
(krea2/anima/moss/qwen).

**Acceptance Criteria:**

- [ ] Moodboard row runs: N reference images (asset ids) + prompt → styled
      output, linked to source assets.
- [ ] Multi-image params typed as repeated `image` params (asset-id upload
      path), count bounded.
- [ ] Probe gates: node presence + required model files; missing → row hidden
      with reason.
- [ ] Any additional weights documented (source, license, VRAM) — not
      assumed.

**Depends on:** TASK-comfyui-workflow-acceptance-probe-scaffold, asset-id image input
path (existing)
