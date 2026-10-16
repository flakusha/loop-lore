<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ComfyUI SAM3 concept mask template

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** sam3-segmentation-integration
**Tags:** comfyui, workflow-templates
**Depends on:** `TASK-sam3-feasibility-probe-meta-model-api-vs-comfyui-custom-node`, `TASK-matting-concept-prompt-contract`, `TASK-comfyui-workflow-parameterization`, `TASK-comfyui-node-id-allocation`
**Related:** TASK-comfyui-first-class-sprite-pipeline-avatar-matting-workflows.md, TASK-comfyui-template-parameter-validation.md, TASK-comfyui-node-discovery.md

**Summary:**

Ship the `sam3-concept-mask` ComfyUI workflow template (Path A): image + concept in, mask out — no client or engine change.

**Context:**

First-Class Program step. Follows the in-place Path A pattern from `epic-comfyui-plugin.md` and the builtin template shape in `src/image-edit/templates/builtin/` + `templateRegistry`. The first-class-citizen defects block this graph: Defect 1 (`{{seed}}` coerced to string — a mask feed is all-integer node wiring and ComfyUI rejects string INTs), Defect 2 (node ids are arbitrary strings, `Math.max()+1` allocation NaNs on `60:45`-style ids), Defect 5 (declared parameter ranges never enforced).

**Acceptance Criteria:**

- [ ] `sam3-concept-mask` registered: `build(params)` returns a graph with a SAM3 loader + concept-conditioned mask output; params `concept` (string, required), `max_matches` (int), `confidence` (number)
- [ ] Numeric params substitute as numbers (blocked on `TASK-comfyui-workflow-parameterization`); new node ids from the shared allocator (blocked on `TASK-comfyui-node-id-allocation`)
- [ ] Ingest validation rejects a graph whose SAM3 node class is absent from `/object_info` with an actionable message naming the missing class — not a raw ComfyUI 400 (Defect 3 follow-up)
- [ ] `concept` validated at the **boundary by a reused schema** (bounded length + charset, string type), not the per-handler presence loop at `src/image-edit/routes.ts:103-114`; invalid → 400 naming the parameter, before any ComfyUI call or asset write; the same schema applies on every entry point (run route + assistant `/image edit`), so no twin path can skip it
- [ ] Test: fixture SAM3 graph renders against the fake ComfyUI server (epic-e2e-integration-testing pattern) and yields the expected mask artifact reference
- [ ] `bun run check` green

## Technical Notes

- Fixture graph comes from the probe ticket's ComfyUI leg.
- Template params reuse the `TemplateParameter` shape in `src/image-edit/types.ts`.
