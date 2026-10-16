<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Sidecar portability — de-hardcode, cross-platform, installable

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** `epic-reference-conditioned-generation`
**Related:** `TASK-comfyui-graph-builder-ts-port.md`, `TASK-lora-audit-standalone.md`, `TASK-minimax-h3-stills-reference-template.md`, `epic-cross-platform-portability.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Remove the machine-specific assumptions from the absorbed sidecar so the H3 stills
workflow runs on a non-Windows host, on a GPU that is not a 5080, and from a
documented install step instead of a copied folder.

## Context

Source artifact: `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`
— **scratch, will be pruned.** Read 2026-10-16. Enumerated portability defects:

### Windows-only

`POST /h3-stills/api/open-take` shells out:
`subprocess.Popen(['explorer.exe', '/select,', str(path)])` (`__init__.py:199`),
with `import subprocess` at `:4` and a response that admits "selection cannot be
confirmed" (`:200-201`). On Linux or macOS this is a guaranteed exception path.
Cross-platform replacement: open the containing directory with the platform's file
manager, or — better — do not shell out at all and return a `file://` path the UI
links to. loop-lore already stores assets and serves them through
`/api/assets/{id}/raw` (`comfyui-provider.ts:203`), so the browser can render it
directly.

### GPU-specific, presented as model-specific

The clearest case: `studio_stills.py:120` rejects a canvas above 4.2 megapixels with
the message *"This 5080 handoff limits the canvas to 4.2 megapixels"*. That cap is
this operator's VRAM. It is annotated as such in the source and would silently
become H3's documented ceiling the moment anyone copies the constant. Same for the
UI copy naming the 5080 (`web/stills.html:16,18`) and
`attention='comfy kitchen attention'` (`:190`).

### Other hardcoded values that should become configuration

- checkpoint basename `MiniMaxH3/minimax_h3_hybrid_fl2va_ref2va_b30-49-int8.safetensors`
  and three CLIP/VAE filenames (`studio_stills.py:17-20`), pinned by
  `normalize()` (`:129-135`)
- output tree `Image/H3_Studio/<project>/WIP` (`:290,299,309,335`) and input
  subdir `h3_studio/still_uploads` (`:302`, `web/stills.mjs:292`)
- sampler `euler`, steps `8`, sigma shifts `8.0`/`3.0`, reference megapixels `1.0`
  (`:123-137`) — these are *starting defaults*, not validation rules
- schema ids `codex.h3.studio.v2` / `codex.h3.still.v1` / `codex.h3.still.record.v1`
  (`graph.py:54`, `studio_stills.py:215,317`)

### Installer

There is none. No `install.sh`, no `README`, no `requirements.txt`, no
`pyproject.toml` anywhere in the tree; `WEB_DIRECTORY` and
`NODE_DISPLAY_NAME_MAPPINGS` are not registered. An operator has to already know
where to copy four `.py` files and eight web assets.

### `profile_verified`

Advisory only (`__init__.py:42-48`): it inspects argv for `--fast`,
`fp16_accumulation`, `--use-ck-attention`, `--reserve-vram`, the *absence* of
`--lowvram`/`--novram`/`--cpu`/`--highvram`/`--gpu-only`/
`--disable-dynamic-vram`, and requires `--listen 127.0.0.1`. It is surfaced in
`capabilities` (`:75,86`) and never blocks a run. That is the right shape — but if
absorbed, the recommendation must reach the operator instead of sitting in a
capabilities payload.

Scope: loop-lore's absorbed surface is the **TypeScript** client and templates
(`TASK-comfyui-graph-builder-ts-port.md`,
`TASK-stills-lifecycle-queue-progress-client.md`). This ticket makes **that**
surface portable. It does not fix the Python source in `.tmp/` — that directory is
scratch and gets pruned.

## Acceptance Criteria

- [ ] No shell-out to `explorer.exe` or any platform-specific file-manager binary;
      the reveal-a-result action works on Linux and macOS, or is replaced by a
      served asset URL
- [ ] No canvas cap is expressed as a model constant. If a practical ceiling is
      needed it is derived from the capability matrix's `vramFloorGb` and named as
      what it is
- [ ] Checkpoint, CLIP/VAE names, sampler, steps, sigma shifts, reference
      megapixels, output prefix, and input subfolder are all configuration with
      defaults, not literals in the code path
- [ ] Output and input paths derive from loop-lore's existing config-path resolution
      (`epic-configs-path-resolution.md`), not from a relative literal that assumes
      a ComfyUI cwd
- [ ] The `profile_verified` recommendation, if surfaced at all, reaches the
      operator as an actionable message rather than a field in a capabilities
      payload
- [ ] Installation of the absorbed workflow is documented and runnable from a
      clean checkout — a prerequisites step (the six external H3 node types) and a
      verification step, so "it does not work" cannot be the first symptom
- [ ] Test: the same stills run completes on a non-Windows host path with no
      platform branch; a path-relative assumption fails a test rather than a user
- [ ] `bun run check` green
