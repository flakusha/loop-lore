<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: QwenVL in-graph prompt enhancer

**Status:** Not Started
**Priority:** low
**Effort:** medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, qwenvl, prompt-enhancement, image-edit, vlm
**Caveats:** weight acquisition (Qwen2.5-VL GGUF absent), VRAM tiers, not-a-captioner, probe-gated

**Summary:**

In-graph prompt-enhancement tier using the installed ComfyUI-QwenVL pack
(AILab_QwenVL_PromptEnhancer / _GGUF_PromptEnhancer): an input image becomes
an edit-prompt suggestion that prefills the prompt param of any
workflow-library row. QwenVL weights are NOT on disk — acquisition is in-AC
(license + VRAM fence) and the tier stays gated until the probe finds the
model. NOT a second captioner: `caption-route.ts` + `ModelRole.Captioning`
(epic-aux-enrichment-pipeline) keep owning asset alt-text. AC: image →
prompt prefill wired, boundary-tested, GGUF variant per VRAM tier.

**Context:**

10 nodes incl. GGUF variants for VRAM tiers (in-pack HuggingFaceDownloader
exists for acquisition). Distinct engine (ComfyUI graph) and consumer (the
edit-prompt box) from the LLM caption seam; `epic-3d-generation.md` tier-3
"in-graph QwenVL verifier" is a named future consumer, not duplicated here.

**Acceptance Criteria:**

- [ ] Enhancer stage wired: image (asset id) → prompt string prefills the
      target row's prompt param.
- [ ] QwenVL weight acquisition documented (gguf file, source URL, license,
      VRAM) — NOT assumed; tier hidden until the probe finds the model.
- [ ] Boundary test: no writes to asset `alt_text`; no `ModelRole.Captioning`
      use; caption-route path untouched.
- [ ] GGUF variant selectable per VRAM tier.

**Depends on:** TASK-comfyui-workflow-acceptance-probe-scaffold, asset-id image input
path (existing)
