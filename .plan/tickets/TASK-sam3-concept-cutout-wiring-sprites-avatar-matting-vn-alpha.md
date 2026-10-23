<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: SAM3 concept cutout wiring — sprites, avatar matting, VN alpha

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-sam3-segmentation-integration
**Tags:** sprite-pipeline, avatar, vn
**Depends on:** `TASK-matting-concept-prompt-contract` + one path (`TASK-comfyui-sam3-concept-mask-template` or `TASK-sam3-direct-provider-via-meta-model-api`)
**Related:** TASK-matting-fallback-aux-pipeline-job.md, TASK-vn-alpha-extraction-matting-job-for-opaque-character-images.md, TASK-comfyui-first-class-sprite-pipeline-avatar-matting-workflows.md, epic-avatar-regeneration-control.md, epic-2d-sprite-world.md, epic-avatar-alpha-vn-layering.md

**Summary:**

Wire concept cutouts into the consumers: sprite pipeline, emotion-avatar auto-matte, VN alpha extraction.

**Context:**

All three consumers exist and are mask-less: `enqueueAutoMatting` (`src/generation/matting/auto-matte.ts`) fires promptless from `single-generation.ts`; VN alpha extraction is its own open ticket; sprite cutouts are the sprite-pipeline sub-epic of `epic-2d-sprite-world`. This ticket makes each request a concept-scoped cutout and keeps failure isolated (a failed matte never unbinds the previous variant — `epic-avatar-regeneration-control` AC).

**Acceptance Criteria:**

- [ ] Avatar auto-matte passes a concept (configurable default, e.g. "character portrait") so cutouts stay consistent across an emotion batch; concept recorded on the job
- [ ] VN alpha extraction requests concept-scoped cutouts and stores alpha derivatives (`AssetAlphaStatus` transitions unchanged)
- [ ] Sprite pipeline can request a per-actor concept cutout; output asset linked to the source via `asset_links`
- [ ] Re-roll keeps the previous variant bound while the new matte completes
- [ ] Tests: one consumer path covered end-to-end against the fake ComfyUI server; when no segmentation provider is configured the path degrades exactly as today and logs the skip
- [ ] `bun run check` green

## Technical Notes

- Degradation path is the point: installs without SAM3/ComfyUI must behave identically to today.
