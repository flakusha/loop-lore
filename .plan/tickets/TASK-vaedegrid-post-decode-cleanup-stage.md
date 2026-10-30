<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VAEDeGrid post-decode cleanup stage

**Status:** Not Started
**Priority:** low
**Effort:** small
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, image-edit, post-processing, vae, degrid
**Caveats:** family-dependent artifact, off-by-default, no-weights, probe-gated

**Summary:**

Opt-in VAEDeGrid stage in the ComfyUI image-edit output path, removing the
2px VAE pixel grid some VAE decoders imprint (Qwen-Image / Wan2.1-class
VAEs). The node is code-only (Nyquist notch filter — no weight files) and is
already operator practice: `i-0038-anima.json` places VAEDeGrid after decode.
AC: workflow-library rows can flag `degrid`; when set, the stage runs
post-VAEDecode pre-persist in the image-edit provider output path; default
off; row gated on the pack-presence probe.

**Context:**

Pack = ComfyUI-DeGrid (single node; manifest-managed so presence is
probe-checkable). Builtin templates never insert it today, so family outputs
that need it get the artifact unless the operator hand-edits the graph.

**Acceptance Criteria:**

- [ ] Row-level `degrid` flag (default off) documented in the row schema.
- [ ] Output-path wiring: flag set → VAEDeGrid inserted after VAEDecode,
      before asset persist, in the image-edit provider path.
- [ ] Probe gate: row blocked with a clear reason when the node is absent.
- [ ] No weight acquisition anywhere (filter node — code only).
- [ ] Verified on a known-grid sample: grid removed, resolution unchanged.

**Depends on:** TASK-comfyui-workflow-acceptance-probe-scaffold
