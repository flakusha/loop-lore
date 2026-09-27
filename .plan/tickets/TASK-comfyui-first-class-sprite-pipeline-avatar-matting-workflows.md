<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI first-class: sprite-pipeline + avatar-matting workflows as in-place templates

**Status:** Not Started
**Priority:** medium
**Effort:** Medium (workflow JSON templates + template registry wiring)
**Summary:** Ship `sprite-sheet`, `sprite-variant`, and `matting-cutout` as ComfyUI workflow JSON templates (Path A: in-place template files), requiring zero client/engine change; consumed by the sprite pipeline and avatar matting flows.
**Context:** First-Class Program step (`epic-comfyui-plugin.md`); serves `epic-2d-sprite-world`. Path A (JSON files on disk, chosen over DB storage) keeps community sharing simple and follows the epic's Open Question resolution.

**Acceptance Criteria:**
- [ ] `sprite-sheet`, `sprite-variant`, `matting-cutout` workflow JSONs in the templates registry with validated graph structure.
- [ ] In-place Path A: templates load from disk, no schema/migration and no engine change.
- [ ] End-to-end test renders each template against a fixture workflow (or mocked ComfyUI) and produces expected output artifact references.
- [ ] `bun run check` green.

**Epic:** epic-comfyui-plugin
**Tags:** comfyui, sprite-pipeline, avatar-matting, workflow-templates, 2d-sprite-world
**Related:** epic-2d-sprite-world, epic-comfyui-plugin.md § Path A


git issue: ffe5ba4
