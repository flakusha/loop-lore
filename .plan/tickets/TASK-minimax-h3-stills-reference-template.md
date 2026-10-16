<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: MiniMax H3 stills reference workflow template

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-reference-conditioned-generation`
**Related:** `TASK-comfyui-graph-builder-ts-port.md`, `TASK-stills-lifecycle-queue-progress-client.md`, `TASK-lora-audit-standalone.md`, `epic-model-family-presets.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The H3 stills workflow as a native loop-lore template, replacing the Python
sidecar's 11-node hardcoded chain with a config-driven one — without importing the
sidecar's hardcoded literals.

## Context

Source artifact: `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`
(**scratch — will be pruned; a reference artifact, never an import target**).
Read 2026-10-16.

The reference chain is `studio_stills.py:183-216`, 11 nodes:
`UNETLoader` → chain-wired `LoraLoaderModelOnly` → `MiniMaxH3SigmaShift` →
`ModelAttentionBackend` (hardcoded `attention='comfy kitchen attention'`, `:190`) →
`CLIPLoader` + 2×`VAELoader` → `MiniMaxH3ReferenceToVideo` (length 5,
`ref_image_size='max'`) → per-reference `LoadImage` + optional
`ImageScaleToTotalPixels`/`ImageBlur` → `BasicGuider` / `KSamplerSelect` /
`BasicScheduler` → `FizgigH3StillLatent` → `RandomNoise` →
`SamplerCustomAdvanced` → `FizgigH3StillDecode` → `SaveImage`.

**What to take:** the chain shape and the role-dependent reference preprocessing.
The `Graph` builder that emits it is generic and is ported separately in
`TASK-comfyui-graph-builder-ts-port.md`.

**What to refuse — the `normalize()` function is a machine profile pretending to
be validation.** It pins steps to 8, sampler to `euler`, sigma shifts to 8.0/3.0,
the model basename to one b30-49 hybrid, CLIP/VAE/audio-VAE to three literals,
reference megapixels to 1.0, and **exactly one** LoRA (`:153`) whose SHA-256 must
equal a hardcoded constant (`studio_loras.py:11-12`). The 4.2-megapixel canvas
cap is explicitly annotated as *"This 5080 handoff limits the canvas to 4.2
megapixels"* (`:120`) — that is a property of one operator's GPU, not of H3.

Six externally installed node types are prerequisites and are **not** in
loop-lore's control: `MiniMaxH3ReferenceToVideo`, `FizgigH3StillLatent`,
`FizgigH3StillDecode`, `MiniMaxH3SigmaShift`, `ImageBlur`,
`ModelAttentionBackend` (`__init__.py:19-20`). The template's `required_nodes`
must name all six so the auto-filter hides it on a stock ComfyUI instead of
submitting a graph that cannot resolve.

The `minimax-h3` entry in `epic-model-family-presets.md` is specified as a
**video** family (`category: video`, `duration`, `resolution`, `frame_rate`). A
stills template is not that preset. Do not overload the video preset with a stills
template; record the split explicitly.

## Acceptance Criteria

- [ ] `configs/workflows/minimax-h3-still.json` reproduces the chain shape with
      sampler / steps / shifts / resolution as **parameters**, not literals
- [ ] `required_nodes` names all six external node types; verified against
      `/object_info` in a test
- [ ] The 4.2MP cap is **not** inherited as an H3 limit — resolution comes from the
      capability matrix, and the machine-specific cap is recorded as an operator
      preference at most
- [ ] Multi-reference role handling matches the shared reference request model
      (the sidecar's `ROLES` whitelist and per-role preprocessing at `:198-204` are
      the reference implementation)
- [ ] The `minimax-h3` **video** preset is not overloaded; the stills/video split is
      recorded in `epic-model-family-presets.md` terms
- [ ] If the six external nodes are unavailable in a plain ComfyUI, that is stated
      as a deployment prerequisite rather than worked around
- [ ] Test: template builds; substituted output passes `isValidWorkflow`
- [ ] `bun run check` green
