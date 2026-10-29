<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: sd.cpp reference-edit parity — RESCOPED: record non-capability only

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-reference-conditioned-generation
**Related:** `TASK-sd-cpp-provider.md`, `TASK-reference-capability-matrix-data-model.md`, `epic-assistant-generation-extensions.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

**Rescoped 2026-10-28 (plan-ivss, unified-backend amendment):** with
ComfyUI as the unified generation backend, reference edits route to the
ComfyUI path — the original parity investigation (establish sd.cpp
reference capability + fallback rule) is answered by backend unification
and is dropped. This ticket now only records sdcpp's non-capability in
the capability matrix; no parity work.

## Context

`generateSDCPP` (`src/generation/image-engine/sdcpp.ts:31-147`) speaks exactly one
endpoint: `POST /sdcpp/v1/img_gen` plus a poll (`sdcppUrl` at `:37`, submit at
`:79-86`, poll loop at `:104-140`). It carries a prompt, LoRA injection via
`injectSdCppLora`, and no image input. So on the current code, **sd.cpp cannot do a
reference edit at all** — there is no field to put the reference image in.

That is a statement about *this codebase*, not about sd.cpp. The operator's own
notes record that FLUX.1 Kontext runs on sd.cpp "at 4-6GB VRAM"
(`epic-comfyui-plugin.md`, *Practical Testing Results* and *Open Questions* #5),
which implies a reference-capable path exists upstream. Whether it does — and under
which API family (the sd.cpp server exposes OpenAI, WebUI, and sdcpp families per
`epic-assistant-generation-extensions.md` *Secondary Backend*) — is exactly what
this ticket answers.

If a reference-capable endpoint exists, the parity question becomes: does it accept
the **same contract** as the ComfyUI path (ordered references with roles)? Almost
certainly not — sd.cpp would take one image and a prompt. Then the capability flag
is what carries that difference, and the fallback rule is decided rather than
discovered.

### Do not duplicate `TASK-sd-cpp-provider.md`

That ticket owns the **assistant-side adapter**: `/image` routing through
`pickSdProvider`, ComfyUI-complex vs sd.cpp-simple selection, fallback on
provider failure, asset persistence, and unit tests for purpose selection. It is
`Not Started` and is the authority on sd.cpp routing.

This ticket is narrower and adjacent:

- **This ticket**: what reference/edit capabilities sd.cpp exposes, recorded as a
  capability record; the decision of what happens when a reference-edit request
  lands on sd.cpp.
- **That ticket**: how `/image` picks a provider in the first place.

If implementing the fallback requires changing `pickSdProvider` call sites, that
edit belongs to `TASK-sd-cpp-provider.md`. Coordinate — do not fork it.

## Acceptance Criteria

- [ ] The capability matrix records, with the endpoint named
      (`POST /sdcpp/v1/img_gen`), that sd.cpp has no reference/img2img
      contract in this codebase — verified against code, not assumed
- [ ] The assistant's reference-edit path treats sd.cpp as unavailable for
      reference edits and routes them to ComfyUI (unified-backend
      decision); no parity/experiment work is in scope
- [ ] A reference-edit request routed to sd.cpp is rejected with a message
      naming the constraint — never a raw 4xx passthrough
- [ ] No change is made to `pickSdProvider` routing or the `/image` adapter; those
      stay with `TASK-sd-cpp-provider.md`
- [ ] `bun run check` green
