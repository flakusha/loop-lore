<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI first-class: sprite-pipeline + avatar-matting workflows as in-place templates

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-2d-sprite-world
**Tags:** comfyui, sprites, workflows

**Summary:** Three in-place workflow JSONs (sprite-sheet, sprite-variant, matting-cutout) covering the 2D sprite pipeline, VN alpha-matting, and emotion-avatar variants — zero client/engine code change.

**Context:**

`epic-comfyui-plugin.md` Integration Decision (2026-08-25) settled this: new usecases are in-place workflow templates consumed by the existing call — Path A (production): `{{placeholder}}` JSON in `configs/workflows/`, auto-discovered by `WorkflowLoader`, filled by `substituteWorkflow` + `applyNodeOverrides`, run by `generateComfyUI` → `runWorkflow`. Zero API-call code change. This task applies that decision to three consumers at once: 2D sprite pipeline (`FEAT-2d-world-pixel-art-sprite-pipeline-*`, ⬜ Not Started), VN alpha-matting (`TASK-vn-alpha-extraction-matting-job-*`), emotion avatars (`src/characters/services/emotion-avatar-service/generation.ts` already drives Path A). The `MattingConfig.backend: 'comfy'` option (src/config/schema/generation.ts:63) already names ComfyUI as a cutout backend — the workflow is the missing piece.

## Implementation

1. `configs/workflows/sprite-sheet.json`: pixel-art sprite template — params `{{prompt}}` (character description), `{{style_pack}}` (world style), `{{width}}`/`{{height}}`, `{{seed}}`; KSampler + LoRA slot for style LoRAs.
2. `configs/workflows/sprite-variant.json`: emotion/equipment/status variant — params add `{{base_image}}` (upload via `uploadImageToComfy` → LoadImage) + `{{variant_prompt}}` (emotion modifier string, same vocabulary as `getEmotionModifier`). img2img denoising ~0.5-0.7 to preserve identity.
3. `configs/workflows/matting-cutout.json`: alpha cutout — Rembg/BiRefNet-style node chain honoring the `matting: 'comfy'` backend contract; input `{{input_image}}`, output transparent PNG.
4. Each JSON: all placeholders covered by `substituteWorkflow` vars; validate with existing workflow-loader tests + one substitution-coverage test per template (fails if a `{{var}}` has no caller-supplied value).
5. Wire callers: sprite pipeline task consumes 1+2, matting job consumes 3, emotion-avatar-service gains variant support via 2. No changes to `ComfyUIClient` or `generateComfyUI`.

**Acceptance Criteria:**

- [ ] Three workflow JSONs land, auto-discovered, all placeholders substitutable
- [ ] Substitution-coverage test per template
- [ ] Engine roundtrip on fixture (mock ComfyUI HTTP) per template
- [ ] Callers wired without client/engine code changes (in-place decision honored)
- [ ] Documentation updated (workflows listed in image-generation.md)
