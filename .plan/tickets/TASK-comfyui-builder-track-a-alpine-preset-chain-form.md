<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI builder Track A Alpine preset-chain form

**Status:** Done
**Status Note:** Done 2026-10-01 — commit d9851684 (admin Builder tab Alpine component)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, builder, alpine, frontend

git issue: 2d03749

**Summary:**

Implements Track A UI of docs/meta/research/comfyui-graph-builder-frontend-plan.md section 4 (phased ticket 3). New Alpine component src/frontend/alpine/comfyui-builder.ts registering globalThis.comfyuiBuilder, following src/frontend/alpine/admin-workflows/{index,list,form}.ts spread-into-admin.ts:64 pattern; ships inside alpine-init.js (src/frontend/alpine-init.ts, entry per src/views/layout.html:38). Form: template pick -> params (TemplateParameter src/image-edit/types.ts:59-70) -> LoRA stack -> run against builder chain-run route. No canvas. Covers txt2img/img2img/upscale operator needs first.

**Context:**

State splits across src/frontend/alpine/comfyui-builder/{list,form,run}.ts (admin-workflows spread-into-admin pattern) composed by index.ts; registered in alpine-init.ts and mounted as the admin Builder tab in src/views/admin.html. The LoRA stack sub-form is not part of this pass — per-stage params come from the template's TemplateParameter list, matching the txt2img/img2img/upscale operator flow.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
