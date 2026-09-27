<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Discover ComfyUI sampler + scheduler enums from /object_info

**Effort:** Small
**Summary:** Sampler and scheduler value lists must come from the installed ComfyUI at runtime, not a hardcoded array and not InvokeAI's conflated enum.
**Context:** Found by investigation 2026-09-27 (`docs/meta/research/comfyui-first-class-investigation.md` §4.1). Sampling a sampler the operator's ComfyUI does not have fails the whole graph at submit.
**Acceptance Criteria:** Both enums discovered and cached; no hardcoded sampler list ships.

**Priority:** P2 — Medium
**Status:** Not Started
**Epic:** epic-comfyui-first-class-citizen
**Depends on:** none

## Description

ComfyUI's `KSampler` takes **two independent axes**: `sampler_name` and
`scheduler`. loop-lore currently hardcodes the first (in the `txt2img` template
defaults) and hardcodes the second (`"scheduler": "normal"` in
`configs/workflows/txt2img.json:41`). Both lists drift from whatever the operator
has installed, and an invalid value fails the entire graph at submit with an
opaque `node_errors` payload.

### Why runtime discovery

`GET /object_info` already returns the installed enum lists:

```
/object_info -> .KSampler.input.required.sampler_name[0]  // installed samplers
             -> .KSampler.input.required.scheduler[0]     // installed schedulers
```

This is the same mechanism LoRA discovery already uses
(`src/generation/lora/discovery.ts` — `/object_info` walk with a 5-minute cache).
**Reuse that pattern and its cache**, rather than adding a parallel discovery
path.

### Why NOT to copy InvokeAI

InvokeAI's `SCHEDULER_NAME_VALUES`
(`invokeai/backend/stable_diffusion/schedulers/schedulers.py:28-60`, 27 values)
is what looks like a ComfyUI sampler list, but it is **not** one:

- Its members are ComfyUI **sampler** names; InvokeAI has no scheduler axis at
  all.
- Its `_k` suffix (`euler_k`, `dpmpp_2m_k`) encodes karras noise schedule, which
  ComfyUI expresses as a separate `scheduler` **input**.
- So InvokeAI collapses ComfyUI's two axes into one flat name list. Adopting it
  would silently drop the scheduler axis — the user picks `euler_k`, gets `euler`
  plus a hardcoded karras schedule, and has no way to say otherwise.

InvokeAI's per-family split is still a useful *hint* that the valid set genuinely
narrows: Anima supports 6 (`invokeai/backend/flux/schedulers.py:98` — `euler,
heun, dpmpp_2m, dpmpp_2m_sde, er_sde, lcm`) versus 3 for Flux. Runtime discovery
supersedes it, but it confirms the enum is backend-specific, not global — another
reason a hardcoded list is wrong.

**Corroboration that `er_sde` is the right shape:** the operator's Anima reference
(`configs/workflows/uploads/i-anima-0001.json:80-81`) uses
`sampler_name: "er_sde"` with `scheduler: "simple"` — two distinct values, exactly
as ComfyUI models them.

## Acceptance Criteria

- [ ] Sampler and scheduler value lists are obtained from `/object_info`, reusing
      the existing LoRA discovery cache and TTL (`src/generation/lora/discovery.ts`).
- [ ] No hardcoded sampler-name array ships in `src/`. If a static list exists for
      editor UX (a `select` needs options before discovery returns), it is marked
      advisory and superseded by discovery — not used for validation.
- [ ] `/api/v1/image-edit/nodes` (`src/image-edit/routes.ts:53-69`) exposes the
      discovered samplers and schedulers so a `select` param can populate itself.
- [ ] Server-side validation rejects an out-of-enum `sampler_name` or `scheduler`
      with a 400 naming the valid values, **before** the graph is submitted. Catching
      it at submit yields an opaque ComfyUI `node_errors` blob; catching it here
      yields a useful message.
- [ ] When ComfyUI is unreachable, the failure is a clear advisory, not a hard 500
      on a route that only wanted a dropdown.
- [ ] Tests: a `/object_info` fixture returns distinct sampler and scheduler lists
      and both are read; a graph with an invalid sampler is rejected with a
      message listing the valid values.
- [ ] Validation composes with `TASK-comfyui-template-parameter-validation` rather
      than duplicating the validation pass.

## Technical Notes

- **Two enums, never one.** Keep `sampler_name` and `scheduler` as separate fields
  through the whole stack: options type, substitution vars, template params, and
  discovery cache. Merging them is the exact mistake InvokeAI makes and the exact
  mistake that would bite when a user wants `euler` + `karras`.
- The graph may not contain a `KSampler` at all (an upscale-only or pure-passthrough
  workflow). Discovery must tolerate a missing node class rather than erroring.
- Not all `KSampler` variants expose the same enum — `KSamplerAdvanced` differs.
  Read the node class the workflow actually uses, and fall back to `KSampler`.
- Out of scope here: the WxH resolution rules. Those are in
  `TASK-comfyui-template-parameter-validation` Gap D.


git issue: 5880e44
