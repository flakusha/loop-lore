<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Image-edit depth conditioned editing

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-derived-map-generation
**Tags:** image-edit, comfyui, controlnet, depth
**Depends on:** `TASK-comfyui-depth-map-generation-template`
**Related:** TASK-image-edit-concept-inpaint-template.md, TASK-derived-map-origin-links.md

**Summary:**

Extend the `controlnet` template so generation can start from an input image (input-latent variant), enabling depth/edge/pose-guided transformation of an existing asset.

**Context:**

`controlnet.ts` builds `EmptyLatentImage` → `KSampler`; `img2img.ts` has no control image. "Transform this shot, guided by its own depth map" requires the two halves in one graph. Depth maps produced by `TASK-comfyui-depth-map-generation-template` (or uploaded) become first-class control images.

**Acceptance Criteria:**

- [ ] `controlnet` template gains a mode (param, not a fork): `source_image` empty → keep `EmptyLatentImage`; present → VAEEncode the source and feed the sampled latent, per `img2img`'s existing wiring
- [ ] `controlnet_strength` and denoise behavior unchanged for the empty-latent mode (regression check)
- [ ] `image_asset`, `control_image`, and numeric params (`controlnet_strength`, `steps`, `cfg_scale`, `seed`) validated at the boundary by a reused schema (bounded types/ranges, string/charset for ids), fast-failing 400 before any ComfyUI call or asset write — not the per-handler presence loop at `src/image-edit/routes.ts:103-114`
- [ ] Authz: `image_asset` and `control_image` ownership/chat-visibility via `src/image-edit/run-authz.ts` before the run; unauthorized → 403, invalid input → 400, never 500
- [ ] Result persisted as a derivative with a `derived-from:controlnet` origin link
- [ ] Test: fake-ComfyUI fixture graph renders both modes; boundary-validation test rejects out-of-range strength and a foreign `image_asset`
- [ ] `bun run check` green

## Technical Notes

- Reuse `_helpers.ts` node factories; do not duplicate VAEEncode wiring from `img2img.ts` by hand — import/share the helper.
- `required_nodes` gains `VAEEncode` for the input-latent variant; ingest validation stays the shared `/object_info` check.

git issue: 159060e
