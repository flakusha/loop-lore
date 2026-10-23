<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Sidecar hardcoded literals become configurable defaults

**Status:** Blocked
**Priority:** high
**Effort:** Large
**Epic:** epic-reference-conditioned-generation
**Related:** `TASK-sidecar-de-hardcoding-cross-platform-installer.md`, `TASK-external-comfyui-plugin-repo-integration-contract.md`, `TASK-sidecar-reveal-cross-platform.md`, `TASK-sidecar-installer-node-registration.md`, `epic-reference-conditioned-generation.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

This is **plugin-repo work, out of loop-lore's scope.** The reviewed H3
stills sidecar pins its recipe, paths, models, schema ids, and LoRA as
module-level literals in its Python source; turning each of them into a
configurable value with a default is work on the Python package itself, which
the **2026-10-16 separate-plugin-repo decision**
(`epic-reference-conditioned-generation.md`, *Absorption decision*) assigns to
the separate ComfyUI plugin repository the repo owner will create. loop-lore
files this as a **tracked escalation** and implements **none** of it: no Python
is written here, nothing lands in `src/` or `configs/`, and the artifact stays
a review-only reference under `.tmp/`. The ticket exists so the plugin
repository inherits a precise, verified defect record; it is **Blocked because
that plugin repository does not exist yet.**

## Context

**Blocker, named explicitly:** the landing target for every item below is the
**separate ComfyUI plugin repository** — the user's own initiative, decided
2026-10-16 and recorded in `epic-reference-conditioned-generation.md`
(*Absorption decision*, "Separate plugin repo (decision, 2026-10-16)"), with
loop-lore's consumption side fixed by
`TASK-external-comfyui-plugin-repo-integration-contract.md`. **That repository
does not exist yet**, and per the same decision loop-lore never vendors,
installs, re-ships, or patches the Python sidecar — so nothing here can land
in this repo. This ticket is the escalation record, not an implementation
plan for loop-lore.

**Source artifact status (binding, unchanged):** a Python ComfyUI HTTP-route
extension handed over 2026-09-30 and functionally reviewed by source read on
2026-10-16, vendored **only** under
`.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`. It is a
**review-only reference artifact**: never committed, `.tmp/` only, never an
import target, and nothing in `src/` may reference it.

Every literal below was verified against that read (2026-10-16,
`studio_stills.py` / `studio_loras.py` / `graph.py` / `web/`); each citation
records what the source says, not a runtime claim, and none of it needs a
live ComfyUI to confirm.

### The module-level pins (all verified literals)

- **Checkpoint and encoders.** `DEFAULT_MODEL`
  `MiniMaxH3/minimax_h3_hybrid_fl2va_ref2va_b30-49-int8.safetensors` plus
  `DEFAULT_CLIP` / `DEFAULT_VIDEO_VAE` / `DEFAULT_AUDIO_VAE`
  (`qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`,
  `minimax_h3_video_vae_int8_convrot.safetensors`,
  `minimax_h3_audio_vae_fp32.safetensors`) — `studio_stills.py:17-20`,
  re-pinned by `normalize()` at `:128-135` (model basename check `:129`, then
  the three `_installed` calls).
- **Recipe pins.** sampler `euler` (`:124-125`, whitelist `SAMPLERS` `:15`),
  steps `8` with min = max (`:123`), sigma shifts `8.0`/`3.0` (`:127`),
  reference megapixels `1.0` (`:136-137`), seed default `1` (`:122`), canvas
  defaults width `2048` / height `1536` (`:118`), and `length:5` /
  `ref_image_size:'max'` (`:193-194`).
- **Paths.** output tree `Image/H3_Studio/<project>/WIP`
  (`:290,299,309,335`) and input subdir `h3_studio/still_uploads`
  (`:302`, surfaced in the SPA at `web/stills.mjs:292`).
- **Attention.** `attention='comfy kitchen attention'` (`:190`).
- **The 4.2MP "5080 handoff" canvas cap.** `:120` rejects
  `width*height>2048*2048` with *"This 5080 handoff limits the canvas to 4.2
  megapixels; start at 2048×1536"* (per-axis 64–2048 clamp at `:118`,
  multiple-of-32 at `:119`), and the UI repeats the framing
  (`web/stills.html:16,18`). The cap is one operator's VRAM, not a MiniMax H3
  family property; `START_HERE.md` agrees the 5080 profile is "an
  unvalidated 5080 starting profile, not a benchmark result".
- **Schema ids — and a key mismatch.** The builder writes `h3_studio` /
  `codex.h3.studio.v2` (`graph.py:54`); the persist step pops that key and
  writes `h3_studio_still` / `codex.h3.still.v1`
  (`studio_stills.py:213-215` — `:214` pops one, `:215` writes the other), and
  run records carry `codex.h3.still.record.v1` (`:317`). Two different keys
  name the same state.
- **LoRA.** `DARETIES_FILE` and `DARETIES_SHA`
  `063df5592549161ff62a1e29ef49978625ee5060eda7d97edfa631bd9aa713b1`
  (`studio_loras.py:11-12`), enforced at `studio_stills.py:157-158` and
  `:170-171`.
- **Roles.** the `ROLES` whitelist
  `{'identity','pose_layout','outfit_detail','environment_style','prop'}`
  (`:14`) with per-role preprocessing (`:196-204`).

Why these are defects: they are *starting defaults and one machine's limits*
presented as validation rules. `normalize()` raises on anything that departs
from them (`:125`, `:127`, `:137`), so a different GPU, checkpoint, or recipe
cannot run without editing the source.

## Acceptance Criteria

- [ ] **No module-level pinned literal remains.** Each pin above is either
      replaced by configuration with a default or removed: the four
      `DEFAULT_*` constants (`studio_stills.py:17-20`, re-pinned `:128-135`);
      sampler `euler` (`:124-125`) and the `SAMPLERS` whitelist shape
      (`:15`); steps `8` (`:123`); sigma shifts `8.0`/`3.0` (`:127`);
      reference megapixels `1.0` (`:136-137`); seed default `1` (`:122`);
      canvas defaults `2048`/`1536` (`:118`); `length:5` /
      `ref_image_size:'max'` (`:193-194`); the `Image/H3_Studio/<project>/WIP`
      output tree (`:290,299,309,335`) and `h3_studio/still_uploads` input
      subdir (`:302`, `web/stills.mjs:292`); `attention='comfy kitchen
      attention'` (`:190`); `DARETIES_FILE` + `DARETIES_SHA`
      (`studio_loras.py:11-12`, enforced `:157-158`, `:170-171`); the `ROLES`
      whitelist (`:14`, preprocessing `:196-204`); and the 4.2MP canvas cap
      (`:120`). Verified by reading the package, not by a live ComfyUI run.
- [ ] **Each value is configurable and carries a default.** The configuration
      surface is explicit (settings file entry, node input, or documented
      config key) and an operator who changes nothing gets today's recipe.
      Evidence: an executed test of the resolver with defaults, or a dated
      observation — no ComfyUI render required.
- [ ] **The 4.2MP cap is no longer presented as a MiniMax H3 family
      property.** The "5080 handoff" message (`studio_stills.py:120`) and the
      UI copy (`web/stills.html:16,18`) name it as one operator's VRAM
      preference (e.g. a per-machine config default), or the cap is removed
      outright; `grep -rn "5080"` over the package returns only
      provenance/comment mentions.
- [ ] **The schema-id mismatch is resolved or documented.** Either one id pair
      wins (with an alias or migration so records written as
      `h3_studio_still` / `codex.h3.still.v1` still load — `:238` reads that
      key), or the two-key behavior is documented at the code with the reason.
      Evidence: grep plus an executed save/load round-trip that needs no
      ComfyUI process.
- [ ] **A grep-based guard fails if any original literal reappears.** The
      plugin repo carries a check that greps its `*.py` for the original
      literals — `minimax_h3_hybrid_fl2va_ref2va_b30-49-int8.safetensors`,
      `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`,
      `minimax_h3_video_vae_int8_convrot.safetensors`,
      `minimax_h3_audio_vae_fp32.safetensors`, `comfy kitchen attention`,
      `h3_studio/still_uploads`, `Image/H3_Studio`, the Dareties SHA-256
      `063df5592549161ff62a1e29ef49978625ee5060eda7d97edfa631bd9aa713b1`,
      `codex.h3.still.v1`, and the `steps`/`sampler`/sigma pin shapes — and
      fails on any match outside an allowlisted provenance comment.
- [ ] **Provenance rule.** Every claim about the fixed behavior — that
      defaults reproduce the reviewed recipe, that previously saved stills
      still load — is backed by an executed test, a dated observation, or a
      written answer from the upstream author. A claim with no provenance is
      not used as if confirmed.
- [ ] **Scope guard.** No acceptance criterion here asks loop-lore to write
      Python, to ship an installer, or to install files under `custom_nodes/`.
      loop-lore's own half — inheriting none of these literals into `src/` or
      `configs/` — stays owned by
      `TASK-sidecar-de-hardcoding-cross-platform-installer.md` and is unchanged
      by this filing.
- [ ] **No `bun run check` gate for this work — deliberately omitted.** The
      landing repo is the plugin repo, where loop-lore's `bun run check` does
      not exist; the gates that guard this work are the plugin repo's own test
      run plus the grep guard above. In this repo the filing touches only
      `.plan/` docs, which the `plan:*` gates cover.
