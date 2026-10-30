<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Krita shared ComfyUI tier

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-external-creative-tool-bridge
**Tags:** bridge, krita, docs
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Documented Krita tier: Krita AI Diffusion (GPL-3, ComfyUI-only backend) pointed at the same ComfyUI instance; loop-lore exports references into a working dir, hand-edit in Krita, re-ingest via the watch tier. No sdcpp bridge (unsupported upstream, closed not-planned). AC: end-to-end doc plus smoke path; working-dir contract (formats, naming) documented; no new in-process Krita code.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Tier lists the four required packs with pinned hashes + node names; soft-fork manifest updated separately.
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Expected manifest entries (Krita tier)

Upstream-required pack pins from krita-ai-diffusion v1.54.0 `backend/resources.py` (comfy_version e902f7b). The manifest lives in the sibling comfyui fork repo — loop-lore cannot edit it from here; these are the entries the Krita tier expects it to carry:

- `comfyui_controlnet_aux` @ e8b689a — InpaintPreprocessor, DepthAnythingV2Preprocessor
- `ComfyUI_IPAdapter_plus` @ b188a6c — IPAdapterModelLoader, IPAdapter
- `comfyui-tooling-nodes` @ b3ae4aa — ETN_LoadImageCache, ETN_SaveImageCache, ETN_Translate
- `comfyui-inpaint-nodes` @ bd6d8fd — INPAINT_LoadFooocusInpaint, INPAINT_ShrinkMask, INPAINT_StabilizeMask, INPAINT_ColorMatch
- optional GGUF @ 01f884b — UnetLoaderGGUF, DualCLIPLoaderGGUF
