<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ComfyUI depth map generation template

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** derived-map-generation
**Tags:** comfyui, depth, workflow-templates
**Depends on:** `TASK-comfyui-workflow-parameterization`, `TASK-comfyui-node-id-allocation`
**Related:** TASK-derived-map-origin-links.md, epic-3d-generation.md

**Summary:**

Ship a `depth-estimation` ComfyUI workflow template: image in, depth PNG out, stored as a derivative asset of the source.

**Context:**

No image→depth path exists in `src/` today. The `controlnet` template takes a control image but generates from an empty latent, so a depth map has no producer. This ticket adds the producer using the in-place Path A pattern (`epic-comfyui-plugin.md`) and the builtin template shape (`src/image-edit/templates/builtin/` + `templateRegistry`).

**Acceptance Criteria:**

- [ ] `depth-estimation` registered: `build(params)` wires the depth-estimation node chain → SaveImage; params `image_asset` (image, required), `model` (select, default the probed model), `invert` (boolean, default false — near=black vs near=white convention)
- [ ] Ingest validation rejects a graph whose depth node class is absent from `/object_info` with an actionable message naming the missing class — not a raw ComfyUI 400
- [ ] Result stored via the edit provider's existing createAsset/linkAsset path as an `image/png` derivative with a `derived-from:depth` origin link (`TASK-derived-map-origin-links`)
- [ ] `image_asset` validated at the boundary by a reused schema: exists, owned by the caller (or chat-visible), `bun run check` green
- [ ] Test: fixture graph renders against the fake ComfyUI server (`epic-e2e-integration-testing` pattern) and yields a depth-map derivative linked to the source
- [ ] `bun run check` green

## Technical Notes

- ComfyUI-only; sd-server throws for controlnet categories and gain nothing here.
- Model choice (ZoeDepth vs MiDaS custom node) is decided by a probe leg first — record the decision in this ticket before implementing.
- Ingest-check precedent: `src/image-edit/routes.ts` handler area; keep the check in the shared loader path, not per template.

git issue: 619131d
