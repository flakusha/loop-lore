<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Reference-generation capability probe

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-reference-conditioned-generation
**Related:** `TASK-reference-capability-matrix-data-model.md`, `TASK-comfyui-ws-client-id-progress-reference-generation.md`, `epic-comfyui-plugin.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

A runnable probe that submits one minimal reference-edit job per model family and
**records** what happened: which reference counts are accepted, peak VRAM, wall
clock, and whether the output actually honours the reference. Writes its results
back into the capability matrix, replacing prose claims with measured rows.

## Context

The capability matrix (`TASK-reference-capability-matrix-data-model.md`) is a schema
with no data. Every number in it today is a recollection from one operator's
machine on 2026-07-28 — the RX 7900 XT notes in `epic-comfyui-plugin.md`. Those
notes are the reason three of the four target families are unusable: Krea 2 is
"not working", Qwen needs "layer rotation" to avoid OOM, and FLUX.1 Kontext was
never run at all.

The probe must therefore answer the questions a human answered by hand:

- Is the family's required node pack even present? `getNodeInfo()`
  (`src/generation/providers/comfyui.ts:256`) already returns the full
  `/object_info` map — filter it against the template's `required_nodes` before
  spending a minute on a run that cannot succeed.
- What is the actual reference-count ceiling? Submit 1, 2, 3, … references and
  record where it fails. ComfyUI's rejection of a 3-image input on a 1-image node
  is the ground truth; the docs are not.
- What is peak VRAM and wall clock, **on the host that ran it**?
- Does the output honour the reference, or does it merely not crash? (The Klein
  "strange results" row is a quality failure with a 200 response — only a human or
  a human-adjacent check catches that.)

Progress reporting rides the `client_id` + `/ws` work. The probe is long-running
and the operator needs to see it advancing; without
`TASK-comfyui-ws-client-id-progress-reference-generation.md` it falls back to the
existing `waitForFiles` poll, which is acceptable for a CLI probe but not for a
UI-triggered run.

Constraint: this is a **development and diagnostic tool**, not a runtime feature.
It must be invocable from a terminal against a running ComfyUI and must not add a
network-exposed route.

## Acceptance Criteria

- [ ] A probe entry point (CLI script) takes a family id and runs the minimal
      reference-edit for it; no new HTTP route
- [ ] Pre-flight: reads `/object_info` and refuses to start when the family's
      `required_nodes` are not all installed, reporting exactly which are missing
- [ ] Sweeps reference counts 1..N per family; records the count at which the
      graph is rejected
- [ ] Records wall clock and peak VRAM **with the host identifier attached**;
      a measurement without its machine is treated as unrecorded, not as zero
- [ ] Writes results into the capability matrix in the matrix's own schema
      (`probedAt` + `probedHost` populated) — the probe does not define its own
      output format
- [ ] Emits a diff view: what the previous recorded claim said vs what was measured
- [ ] Test with a fake ComfyUI server: missing-node pre-flight refuses and names
      the node; a synthetic reference-count rejection is recorded at the correct count
- [ ] `bun run check` green
