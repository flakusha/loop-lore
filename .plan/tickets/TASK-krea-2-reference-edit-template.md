<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Krea 2 reference-edit workflow template

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-reference-conditioned-generation
**Related:** `TASK-krea-2-reference-edit-diagnosis.md`, `TASK-multi-reference-conditioning-request-model.md`, `TASK-reference-capability-matrix-data-model.md`, `epic-comfyui-plugin.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The `krea-2-edit` ComfyUI workflow: Krea 2 conditioning on a reference image,
registered in the template registry with honest `required_nodes` and declared
parameters.

## Context

`epic-comfyui-plugin.md` Phase 3 carries the item "Krea 2 template (after retest
root-causes the current failure)" — correctly gated on diagnosis. This ticket is
the post-diagnosis work and **must not start before
`TASK-krea-2-reference-edit-diagnosis.md` closes with a named root cause**.

Which template form is not a new decision: `epic-comfyui-plugin.md`
(*Integration Decision*, 2026-08-25) settled it as *in-place*, no custom API-call
shape. New usecases are **workflow templates consumed by the existing call**. So
this is a JSON template in `configs/workflows/` (Path A, discovered by
`WorkflowLoader`) plus, if the assistant `/image edit` command needs a parameter
form, a TS `WorkflowTemplate` in `src/image-edit/templates/builtin/` registered
in `templateRegistry` (Path B). No new endpoint, no change to
`ComfyUIClient.submitWorkflow`.

`required_nodes` must be the nodes this graph **actually** uses, and the template
must be filtered out of listings when they are absent. The machinery for that
exists (`TemplateRegistry.listAvailable(backend, installedNodes)`,
`src/image-edit/template-registry.ts:117-128`) but has no production caller today —
`TASK-comfyui-node-discovery-template-autofilter.md` wires it. Do not hand-roll a
second filter here.

`epic-model-family-presets.md` specifies a `krea-2` preset with a
`style_reference` parameter and `prompt_format: natural`. That preset is
**design-only** — `configs/templates/workflows/model-families.yaml` does not exist
(`epic-model-family-presets.md` status note, verified 2026-10-09). If this ticket
lands before the preset file, the prompt-format rule must be documented inline at
the template and moved to the preset when that epic lands, not duplicated in two
places.

## Acceptance Criteria

- [ ] Blocked-on recorded: `TASK-krea-2-reference-edit-diagnosis.md` is Done and its
      root cause is cited in this ticket's Context
- [ ] `configs/workflows/krea2-edit.json` builds a valid Krea 2 reference-edit
      graph, parameterized by the shared reference request model
- [ ] `required_nodes` lists exactly the `class_type`s the JSON uses; verified
      against `/object_info` in a test
- [ ] Registered in `templateRegistry` with declared parameters (references,
      prompt, seed, size, LoRA strength) — no undeclared params read from the body
- [ ] Composes with LoRA injection through the existing `injectComfyUILora` path
      and allocates node ids without the arithmetic bug
- [ ] Substituted output is type-checked end to end (numeric `{{var}}` stays a
      number) — the substitutor defect must not be reproduced in a new template
- [ ] Result persists as a loop-lore asset through the same
      `createAsset`/`linkAsset` contract as `src/image-edit/providers/comfyui-provider.ts`
- [ ] Test: template builds; `required_nodes` matches the JSON's class types;
      substituted workflow passes `isValidWorkflow`
- [ ] `bun run check` green
