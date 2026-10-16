<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Reference-generation capability matrix — data model

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `epic-reference-conditioned-generation`
**Related:** `epic-model-family-presets.md`, `epic-comfyui-plugin.md`, `TASK-reference-capability-probe-runtime.md`, `TASK-multi-reference-conditioning-request-model.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

One typed record per model family stating what it supports — multi-reference count,
inpainting/mask, strength/denoise, LoRA, resolution, VRAM floor, expected latency —
plus a validator that rejects an unsupported reference-edit request **before** a
workflow is submitted, instead of letting ComfyUI reject the graph minutes later.

## Context

Every capability fact about reference editing currently lives as prose in two
epic files, written from a single RX 7900 XT session on 2026-07-28 and never
re-run since:

- `epic-comfyui-plugin.md` → *Practical Testing Results*
- `epic-assistant-generation-extensions.md` → *Editing Models (Tested 2026-07-28)*

Both carry the same rows (FLUX.1 Kontext "not tested", Qwen Image Edit "works,
slow, >20GB, needs layer rotation", Krea 2 "not working, needs retest", Klein
"strange results", LoRA "works, coeff 0.3–0.7"). Prose tables do not fail a build,
do not gate a request, and cannot record *which machine* produced the number.

The existing code has no place to put this. `TemplateRegistry`
(`src/image-edit/template-registry.ts`) filters only on `backend` and
`required_nodes` — `listAvailable(backend, installedNodes)` — which answers "is the
node pack installed?", never "can this model do what was asked?".
`configs/templates/workflows/model-families.yaml` is where a per-family record
would belong, but per `epic-model-family-presets.md` **that file does not exist
and no formatter engine is implemented** — the preset design is entirely
aspirational. A `krea-2` and a `minimax-h3` entry are *specified* there; `krea-3`
and `qwen-image-edit-2.1` are absent.

This ticket is the schema and the validator only. Populating it with real numbers
is `TASK-reference-capability-probe-runtime.md`.

Related and NOT owned here: `TASK-comfyui-template-parameter-validation` owns
enforcing declared `min`/`max`/`step` on template parameters; this ticket owns
capability-shaped validation (does the family take 3 references?) which is a
different question with a different failure message.

## Acceptance Criteria

- [ ] A `ReferenceCapability` type declares: `family`, `maxReferences`,
      `supportsMask`, `supportsStrength`/`denoiseRange`, `supportsLora`,
      `resolution: {min,max,multipleOf}`, `vramFloorGb`, `expectedLatencySec`
      (a range, not a point), `probedAt` + `probedHost`
- [ ] Records load from config with a validated shape — no DB table, no new table
      in `prompt_templates`. Load path is
      `configs/templates/workflows/model-families.yaml` **if that file exists by the
      time you start** (see Context: it does not today). If it still does not exist,
      ship the schema plus a TS module of the same records under
      `src/generation/` and add an AC here recording that the YAML path is
      deferred behind `epic-model-family-presets.md` — do not block this ticket on
      another epic, and do not create an empty YAML file to make the AC pass
- [ ] A validation function takes (capability, request) and returns a typed
      violation list; each violation names the family, the limit, and what was
      supplied
- [ ] Over-reference, over-resolution, and out-of-range denoise each fail with a
      400 naming the family and its declared ceiling — not a generic template error
- [ ] An **unknown or absent** family is an explicit rejection, not a permissive
      default; a family with no probe record is distinguishable at runtime from a
      family measured at zero support
- [ ] Test: one family with `maxReferences: 1` rejects a 3-reference request; a
      conforming request passes; an unprobed family reports `unprobed` rather than
      `supported`
- [ ] `bun run check` green
