<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI parameter-map derivation from marked workflows

**Status:** Done
**Status Note:** Landed on feat-comfyui-param-derivation (owner-verified 2026-10-30): src/generation/comfyui-params/ (marks.ts, type-map.ts, spec-shape.ts, sidecar.ts, inject.ts, derive.ts, types.ts, errors.ts, index.ts plus derivation/type-map tests) and the derivation docs section in docs/spec/integrations/image-generation.md.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, workflows, parameterization, object-info
**Caveats:** idempotency, stale state, data races

**Summary:**
Derive a workflow-library row's `TemplateParameter[]` and `{{var}}`
placeholders automatically: node-title prefix marks (e.g. `[p]`) select the
parameterizable nodes/inputs; types, bounds, and combo options come from a
pinned `/object_info` snapshot; defaults come from the workflow's own current
widget values; placeholder injection reuses `applyNodeOverrides` +
`substituteWorkflow` unchanged. AC: v-0010 with marked Settings-subgraph
inputs derives a typed parameter map whose substitution round-trips through
`buildWorkflowGraph`, and re-derivation is idempotent (operator edits win).

**Context:**
Today params are hand-declared (builtins) or crudely derived for repair only
(`src/generation/workflow-library/seed-parameters.ts` derives one string param
per placeholder). `/object_info` already carries per-input type + [min,max,
step] + live combo lists (`getNodeInfo()`), and the sampler/scheduler
discovery ticket set the reuse-the-discovery-cache precedent.

**Acceptance Criteria:**
- [ ] A marking convention selects parameterized inputs: nodes whose title
      carries the `[p]` prefix expose their unconnected widget inputs; subgraph
      boundary inputs expose via their boundary label; marks survive
      round-trip through the editor save.
- [ ] Type mapping from object_info: INT/FLOAT → number (min/max/step),
      BOOLEAN → boolean, static COMBO → select(options), folder-backed COMBO →
      string with runtime-discovered options (sampler-ticket pattern), typed
      sockets (IMAGE) → `image` param riding the asset-id upload path; default
      = the workflow's current widget value. Derived `select` params carry an
      option-SOURCE marker (static list vs runtime discovery) so the
      parameter-form renderer can pick a searchable control for growable
      option sets — folder-backed combos (models, upscale models, watermark
      paths — ~27 of v-0010's boundary inputs) are unbounded by nature.
- [ ] Sidecar overrides (`<workflowId>.overrides.json`): rename, hide, bounds/
      options override, label — validated at derive time; unknown override
      targets are an error, not a silent skip.
- [ ] Placeholder injection writes `{{name}}` into the converted API graph at
      exactly the marked inputs (via `applyNodeOverrides`), so
      `substituteWorkflow`/`uploadImageParams` work unchanged; whole-string
      placeholders preserve types.
- [ ] Re-derivation is idempotent: re-running derivation on a row whose params
      were operator-edited preserves operator labels/bounds unless the override
      sidecar changes (INSERT-IF-CHANGED semantics documented).
- [ ] Offline: derivation runs against a committed `/object_info` snapshot
      fixture; unit tests need no server.
- [ ] Docs: the marking convention + sidecar format documented next to the
      workflow library docs.

**Depends on:** TASK-ui-api-workflow-converter (converted API graph is the
injection target).
