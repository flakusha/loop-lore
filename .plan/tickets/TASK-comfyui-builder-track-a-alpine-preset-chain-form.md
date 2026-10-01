<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI builder Track A Alpine preset-chain form

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, builder, alpine, frontend

git issue: 2d03749

**Summary:**

Implements Track A UI of docs/meta/research/comfyui-graph-builder-frontend-plan.md section 4 (phased ticket 3). New Alpine component src/frontend/alpine/comfyui-builder.ts registering globalThis.comfyuiBuilder, following src/frontend/alpine/admin-workflows/{index,list,form}.ts spread-into-admin.ts:64 pattern; ships inside alpine-init.js (src/frontend/alpine-init.ts, entry per src/views/layout.html:38). Form: template pick -> params (TemplateParameter src/image-edit/types.ts:59-70) -> LoRA stack -> run against builder chain-run route. No canvas. Covers txt2img/img2img/upscale operator needs first.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
