<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Qwen Image Edit 2.1 reference-edit workflow template

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `epic-reference-conditioned-generation`
**Related:** `TASK-sd-cpp-reference-edit-parity.md`, `TASK-multi-reference-conditioning-request-model.md`, `TASK-reference-capability-matrix-data-model.md`, `epic-comfyui-plugin.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The `qwen-image-edit-2.1` ComfyUI workflow, with the OOM behaviour that made Qwen
Image Edit expensive (recorded as ">20GB, slow, needs layer rotation") either
engineered into the graph or explicitly declined and recorded.

## Context

Qwen is the only reference-edit model in the repo with a **positive** recorded
result: `epic-comfyui-plugin.md` says "Qwen Image Edit | Works, decent | Slow,
>20GB real usage, needs layer rotation", and `epic-assistant-generation-extensions.md`
lists it as the fallback for character portraits, emotion avatars, item icons,
location art, and world maps. So the template is worth building — but only if the
cost is confronted.

Two known costs, both recorded and neither engineered around:

1. **VRAM.** ">20GB real usage" is above the recorded RX 7900 XT's practical
   budget. The epic's own open question #8 asks "Can OOM avoidance be automated in
   the ComfyUI workflow?" — still unanswered. Layer rotation, block swapping, or
   sequential VAE decode are all graph-level settings, so the answer is yes or no
   **by graph construction**, not by raising a flag.
2. **Latency.** "Slow" plus a per-run VRAM floor makes this the worst candidate
   for the interaction loop and the best candidate for a background job. The
   capability matrix's `expectedLatencySec` is where that gets recorded as a range
   rather than a point.

The version matters. Every record in the repo is for "Qwen Image Edit" with no
version. 2.1 is a different checkpoint with a different node graph; the 2026-07-28
result does **not** transfer and must not be copied into the matrix as if it did.
The capability matrix's `probedAt`/`probedHost` fields exist precisely to make this
distinction visible.

`epic-model-family-presets.md` specifies a `qwen-edit` preset with
`prompt_format: edit-instruction` and a dual `modes: [t2i, i2i]` — i.e. the same
family serves both text-to-image and image-to-image. That file does not exist
(`epic-model-family-presets.md` status note). If this ticket lands first, the mode
split is expressed in the template and documented as pending migration to the
preset.

## Acceptance Criteria

- [ ] The 2.1 checkpoint's actual node graph is read from `/object_info`, not
      assumed; `required_nodes` matches
- [ ] OOM strategy is **decided and recorded**: graph-level mitigation, an explicit
      minimum-VRAM precondition that returns a clear error below the floor, or both.
      "It may OOM" is not an answer, and raising a memory flag is not a mitigation
- [ ] `configs/workflows/qwen-image-edit-2.1.json` builds a valid graph from the
      shared reference request model, supporting the family's dual t2i/i2i mode
- [ ] Capability-matrix row records the *measured* VRAM floor and latency range
      with `probedAt`/`probedHost` — the 2026-07-28 ">20GB" figure is either
      re-measured or explicitly marked as stale-and-legacy-version
- [ ] Registered in `templateRegistry`; result persists as a loop-lore asset
- [ ] Test: template builds; substituted output passes `isValidWorkflow`; a
      below-floor request produces the declared precondition error, not an OOM
- [ ] `bun run check` green
