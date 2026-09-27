<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Enforce TemplateParameter ranges + plumb width/height/scheduler

**Effort:** Small–Medium
**Summary:** Template parameters declare min/max/step that nothing enforces, and `ImageGenOptions` has no width/height at all — which blocks every WxH template.
**Context:** Found by investigation 2026-09-27 (`docs/meta/research/comfyui-first-class-investigation.md` §2.1-2.3). Trust-boundary gap: a client posts arbitrary `steps`/`width` straight into a ComfyUI graph.
**Acceptance Criteria:** Declared ranges enforced server-side; `width`/`height`/`scheduler` reach the workflow from the request.

**Priority:** P1 — High
**Status:** Not Started
**Epic:** epic-comfyui-first-class-citizen
**Depends on:** none (independent of the other tickets in this epic)

## Description

Three related gaps in the generation parameter surface. Together they make every
WxH/aspect-ratio template unimplementable.

### Gap A — declared ranges are never enforced

`TemplateParameter` (`src/image-edit/types.ts:59-70`) declares `min`, `max`,
`step`, `required`, `options`. `handleRun`
(`src/image-edit/routes.ts:97-106`) checks **only** `required`:

```ts
if (p.required && !body.params[p.name]) { missing.push(p.name); }
```

`txt2img` declares `width: { min: 64, max: 2048, step: 64 }` and happily accepts
`width: 999999` or `width: 13`. The builtin `build()` functions pass params
straight through to the graph.

This is a **trust boundary**, not cosmetics: the values become ComfyUI graph
inputs.

### Gap B — no width/height in the options type

`ImageGenOptions` (`src/generation/image-engine/types.ts:6-25`) has no `width` or
`height` field. `generateComfyUI`
(`src/generation/image-engine/comfyui.ts:29-38`) reads them from config:

```ts
width: sdConfig.defaults.width,    // config, not opts
height: sdConfig.defaults.height,  // config, not opts
```

Same in `sdapi.ts:20-28` and `sdcpp.ts:44-58`. A request-supplied size cannot be
honoured at all. The `size?: string` field is openai-shaped (`"1024x1024"`) and
is not plumbed into the ComfyUI path.

### Gap C — scheduler and denoise are unreachable

`buildSubstitutionVars` (`src/generation/workflow-substitutor.ts:144-153`)
emits `prompt`, `negative_prompt`, `width`, `height`, `steps`, `cfg_scale`,
`sampler`, `seed`. No `scheduler`, no `denoise` — yet
`configs/workflows/txt2img.json:40-41` hardcodes both as literals
(`"scheduler": "normal"`, `"denoise": 1`).

`ImageGenOptions` has `denoisingStrength` (different name) and no `scheduler`.
`generateComfyUI` passes neither into the loader call.
`src/image-edit/templates/builtin/_helpers.ts:57-99` (`ksamplerNode`) emits a
`scheduler` input but hardcodes it rather than threading it from params — the
same bug, already shipped in a builtin template.

## Acceptance Criteria

### Gap A

- [ ] A validator runs over `template.parameters` before `build()` is called,
      enforcing `required`, `min`, `max`, and `step`.
- [ ] Violations return 400 naming the parameter, the declared bound, and the
      received value — not a generic message.
- [ ] Reuses existing primitives rather than inventing new ones: `clamp`
      (`src/utils/clamp.ts:30-34`) and `clampUnit` (`:56-58`), or the Elysia
      `t.Number({ minimum, maximum })` pattern already used at
      `src/generation/lora/routes/validate.ts:13`. No new dependency.
- [ ] `select` params reject values outside `options`.
- [ ] Tests: below-min, above-max, off-step, unknown-select-value, and a
      boundary-valid value all behave as declared.
- [ ] The declared `step: 64` on width/height is re-evaluated — see Gap D.

### Gap B

- [ ] `ImageGenOptions` gains `width`/`height` (numbers).
- [ ] `generateComfyUI`, `generateSDAPI`, `generateSDCPP` prefer `opts.width` /
      `opts.height`, falling back to `sdConfig.defaults` when absent — preserving
      current behavior for callers that omit them.
- [ ] `handleImageGeneration` maps the openai-shaped `size` string
      (`"1024x1024"`) to `width`/`height` when the two numeric fields are absent.
      Malformed `size` returns 400, not a silent fallback.
- [ ] Tests assert opts-supplied dimensions reach the workflow, and that
      omission still yields the config default.

### Gap C

- [ ] `buildSubstitutionVars` emits `scheduler` and `denoise`.
- [ ] `ImageGenOptions` gains `scheduler`; `denoise` is reconciled with the
      existing `denoisingStrength` (one name, not two — pick the ComfyUI-correct
      one and alias at the boundary).
- [ ] `ksamplerNode` threads `scheduler` from params instead of hardcoding.
- [ ] `configs/workflows/txt2img.json` replaces its hardcoded
      `"scheduler": "normal"` with `{{scheduler}}`.

### Gap D — resolution rules (from InvokeAI, see research §4.3)

- [ ] Width/height snap to `multiple_of = 8` (ComfyUI's `LATENT_SCALE_FACTOR`),
      not 64. The current `step: 64` is stricter than ComfyUI requires and would
      reject valid 8-aligned sizes like 1000.
- [ ] Family base sizes documented: 512 (SD1.5) / 768 (SD2) / 1024 (SDXL, Flux,
      Anima) per `invokeai/app/invocations/ideal_size.py:39-74`.
- [ ] Snap-vs-reject is an explicit decision recorded in the code: snapping is
      friendlier, rejecting is honest. Do not leave it implicit.

## Technical Notes

- Sampler and scheduler are **two independent ComfyUI axes**. Do not adopt
  InvokeAI's single conflated `SCHEDULER_NAME_VALUES` enum — it has no scheduler
  axis and would silently drop it. See research §4.1.
- Sampler/scheduler value discovery is deliberately NOT in this ticket; it is a
  runtime `/object_info` concern tracked separately.
- `clamp` returns `NaN` unchanged so callers can distinguish "was out of range"
  from "was clamped to a bound" — use that to report rather than silently coerce.
- Defect 8 in the research ledger: the JSDoc at
  `workflow-substitutor.ts:62` claims non-string returns while the signature and
  body return `string`. Fix the doc when the numeric fix lands (that ticket), so
  the two do not drift again.


git issue: b89e39a
