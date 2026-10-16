<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Sidecar literals — inherited-literal guard (de-hardcoding, cross-platform, and installer are plugin-repo scope)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** `epic-reference-conditioned-generation`
**Related:** `TASK-comfyui-graph-builder-ts-port.md`, `TASK-lora-audit-standalone.md`, `TASK-minimax-h3-stills-reference-template.md`, `epic-cross-platform-portability.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

**Scope-exclusion ticket.** loop-lore's half is narrow: **do not inherit** the
sidecar's hardcoded literals into any loop-lore config, template, or code path.
The de-hardcoding itself, the `explorer.exe` cross-platform replacement, and the
installer are **plugin-repo work, out of scope** — recorded here and escalated,
not implemented. **loop-lore should not hold this kind of responsibility**: the
Python files that need those fixes ship from the separate ComfyUI plugin
repository, which is the user's own initiative and will be integrated with
loop-lore later. No acceptance criterion here asks loop-lore to write Python, an
installer, or to ship files.

## Context

Source artifact: a Python ComfyUI HTTP-route extension, handed over **2026-09-30** by
an external acquaintance of the repo owner and vendored **only** under
`.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`. That directory is
scratch, gitignored, and was **never committed**. It was pruned before
implementation — which is why this ticket was first written with its sidecar-derived
claims unverified — and it **has since been re-acquired and was functionally
reviewed on 2026-10-16 by reading the on-disk source.** It is a **review-only
reference artifact**: never committed, `.tmp/` only, never an import target, and
nothing in `src/` may reference it. Per the separate-plugin-repo decision the
Python side itself ships from its own plugin repository, **and this ticket does
not fix it.** Nothing below is a loop-lore
implementation task: the sections that follow are a **defect record the plugin repo
inherits**, and the only work this ticket accepts is loop-lore's guard against
copying the literals in.

The defects enumerated below are **verified against that read**, each with its literal
quoted — they are records of what the Python source says, not work items for loop-lore.
The `profile_verified` note below records exactly which part gates a run and which part
does not, from the code. Anything that needs a live ComfyUI to confirm (what
`reviewed_profile()` returns under a real launch, whether the six external node types
resolve) is the **plugin repo's runtime question**; this ticket records the claim and
its open status rather than assuming an answer.

### Windows-only

`POST /h3-stills/api/open-take` shells out:
`subprocess.Popen(['explorer.exe', '/select,', str(path)], close_fds=True)`
(`__init__.py:199`), with `import subprocess` at `:4` and a response that admits
"selection cannot be confirmed" (`:200-201`). It first resolves the path and requires
it to sit under the ComfyUI input or output root and to be an existing file
(`:196-198`). On Linux or macOS this is a guaranteed exception path — the call names a
Windows binary with no fallback. **The cross-platform replacement is plugin-repo work**:
open the containing directory with the platform's file manager, or do not shell out at
all and return a `file://` path the UI links to. loop-lore is unaffected either way — it
never called this route, and an action loop-lore does not ship needs no loop-lore
fallback. If loop-lore ever builds its own reveal-a-result action, it must not shell out
to a platform-specific binary; nothing in this epic asks for one.

### GPU-specific, presented as model-specific

The clearest case: `studio_stills.py:120` rejects a canvas above 4.2 megapixels with
the message *"This 5080 handoff limits the canvas to 4.2 megapixels; start at 2048×1536"*
(the test is `width*height>2048*2048`, with the per-axis 64–2048 range clamped at `:118`
and a multiple-of-32 check at `:119`). That cap is this operator's VRAM. It is annotated
as such in the source and would silently become H3's documented ceiling the moment anyone
copies the constant. Same for the UI copy naming the 5080 — "5080 sizing is not yet
render-validated" (`web/stills.html:16`) and "The 5080 output size still needs local
validation" (`:18`) — and `attention='comfy kitchen attention'` (`studio_stills.py:190`).
`START_HERE.md` agrees: the 5080 profile is "an unvalidated 5080 starting profile, not a
benchmark result".

### Other hardcoded values (plugin-repo defect record)

- checkpoint basename `MiniMaxH3/minimax_h3_hybrid_fl2va_ref2va_b30-49-int8.safetensors`
  and three CLIP/VAE filenames (`studio_stills.py:17-20` — `DEFAULT_MODEL`, `DEFAULT_CLIP`,
  `DEFAULT_VIDEO_VAE`, `DEFAULT_AUDIO_VAE`), pinned by `normalize()` (`:128-135`: model
  basename + Ref2VA-capable check, then the three encoder/VAE `_installed` calls)
- output tree `Image/H3_Studio/<project>/WIP` (`:290,299,309,335`) and input
  subdir `h3_studio/still_uploads` (`:302`, `web/stills.mjs:292`)
- sampler `euler`, steps `8`, sigma shifts `8.0`/`3.0`, reference megapixels `1.0`
  (`:123-137`) — these are *starting defaults*, not validation rules. Also the
  canvas defaults themselves: width 2048 / height 1536 at `:118`, seed default 1 at
  `:122`, and `length:5` / `ref_image_size:'max'` at `:193-194`
- schema ids `codex.h3.studio.v2` / `codex.h3.still.v1` / `codex.h3.still.record.v1`
  (`graph.py:54`, `studio_stills.py:215,317`). Note the builder-side id
  (`h3_studio` / `codex.h3.studio.v2`) and the persisted id
  (`h3_studio_still` / `codex.h3.still.v1`) are **different keys** —
  `studio_stills.py:213-215` pops one and writes the other
- the LoRA basename and its SHA-256 (`studio_loras.py:11-12`), enforced at
  `studio_stills.py:157-158` and `:170-171`; and the role whitelist
  `ROLES` (`studio_stills.py:14`) with the per-role preprocessing at `:196-204`

### Installer

There is none. The whole artifact is `START_HERE.md`, four `.py` files
(`__init__.py`, `graph.py`, `studio_loras.py`, `studio_stills.py`), and eight `web/`
assets (the `FILES` set, `__init__.py:17-18`) — no `install.sh`, no `README`, no
`requirements.txt`, no `pyproject.toml` anywhere, and `WEB_DIRECTORY` and
`NODE_DISPLAY_NAME_MAPPINGS` are not registered. An operator has to already know
where to copy four `.py` files and eight web assets. `START_HERE.md` documents the
install as a manual copy into `ComfyUI/custom_nodes/`, with the only dependency being
ComfyUI's own aiohttp/`folder_paths`/`nodes` runtime.

### `profile_verified`

Advisory on the server, **enforced in the SPA** — verified from the code, and the two
halves must not be conflated.

Server side (`reviewed_profile()`, `__init__.py:42-48`): it inspects `sys.argv` for
`--fast`, `fp16_accumulation`, `--use-ck-attention`, `--reserve-vram`, the *absence*
of `--lowvram`/`--novram`/`--cpu`/`--highvram`/`--gpu-only`/`--disable-dynamic-vram`,
and requires `--listen` followed by `127.0.0.1`. The boolean is surfaced in the
`capabilities` payload (`:75,86`) and **no Python route blocks a run on it** — the
`prepare` handler never reads it.

Client side (`web/stills.mjs`): the Queue button is disabled whenever
`!capabilities.profile_verified` (`:160`, and again on the capabilities refresh at
`:388`), the readiness line tells the operator "Queue needs the documented 5080 memory
profile; Save is still available" (`:161`), and `prepare(true)` throws *"The approved
local H3 launch profile is not active. Save the workflow, but do not queue this
server."* (`:167`) — so a still can be saved without the profile but cannot be queued
without it. Saving still works, which is the right shape; but "advisory only" is wrong
about the shipped product. **loop-lore absorbs nothing here** — it has no launch-profile
surface, and this epic asks for none. The observation is recorded for the plugin repo:
a launch-profile gate belongs next to the action it gates, expressed as an actionable
operator message, not as a bare field in a capabilities payload.

Scope: the defects below are recorded as **reference notes the plugin repo
inherits**. loop-lore's absorbed surface is the **TypeScript** halves
(`TASK-comfyui-graph-builder-ts-port.md`,
`TASK-stills-lifecycle-queue-progress-client.md`), and this ticket's only
implementation half is the guard that stops loop-lore copying the literals in.
It does not fix the Python source in `.tmp/` — that directory is scratch, stays
uncommitted, and per the separate-plugin-repo decision the Python half ships from
its own plugin repository rather than from loop-lore. **The de-hardcoding, the
`explorer.exe` replacement, and the installer are escalated to that repository,
not implemented here.**

## Acceptance Criteria

- [ ] **No sidecar literal is inherited** into `src/` or `configs/` — checked by
      grep, not by review: steps `8`, sampler `euler`, sigma shifts `8.0`/`3.0`,
      the `MiniMaxH3/minimax_h3_hybrid_fl2va_ref2va_b30-49-int8.safetensors`
      basename and its three CLIP / video-VAE / audio-VAE literals
      (`studio_stills.py:17-20`, pinned `:128-135`), the `1.0` reference
      megapixels, the single-LoRA SHA-256 pin (`studio_loras.py:11-12`, enforced
      `studio_stills.py:170-171`), and the `Image/H3_Studio/<project>/WIP` output
      tree / `h3_studio/still_uploads` input subfolder
- [ ] The **4.2-megapixel canvas cap is recorded as one operator's VRAM
      preference and never as a MiniMax H3 family property.** It is not written
      into `epic-model-family-presets.md`, into any `minimax-h3` preset, or into
      the capability matrix as a model ceiling. Where loop-lore needs a practical
      ceiling it is derived from the capability matrix's `vramFloorGb` and named
      as what it is
- [ ] Where loop-lore declares values that play the same role (sampler, step
      count, reference megapixels, resolution ceiling) they are **configuration
      with defaults, resolvable per family** — the sidecar's `normalize()` machine
      profile is not re-created as loop-lore validation. Output and input paths
      resolve through loop-lore's existing config-path resolution
      (`epic-configs-path-resolution.md`), never a relative literal that assumes a
      ComfyUI cwd
- [ ] **De-hardcoding, the `explorer.exe` cross-platform replacement, and the
      installer are out of scope — plugin-repo work.** They are escalated to the
      separate ComfyUI plugin repository and implemented nowhere in loop-lore. No
      acceptance criterion in this ticket asks loop-lore to write Python, to ship
      an installer, or to install files under `custom_nodes/`
- [ ] Test: a grep-based guard fails if any of the pinned literals above reappears
      in `src/` or `configs/`; no live ComfyUI run is required, because none of the
      accepted work is a run
- [ ] **Provenance recorded.** Every sidecar-derived claim this ticket relies on is
      now **verified by source read** (2026-10-16,
      `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`): the
      `explorer.exe` shell-out with `close_fds=True` and its input/output-root guard
      (`__init__.py:199`, `:196-198`, `:4`, `:200-201`); the 4.2MP canvas cap and its
      message (`studio_stills.py:120`, range clamp `:118`, multiple-of-32 `:119`);
      the checkpoint/CLIP/VAE literals (`studio_stills.py:17-20`, pinned
      `:128-135`); the output and input path literals (`:290,299,309,335`,
      `:302`, `web/stills.mjs:292`); the recipe literals (`:122-137`, `:193-194`);
      the schema ids and the fact that the builder-side and persisted keys differ
      (`graph.py:54`, `studio_stills.py:213-215,317`); the missing installer (the
      artifact is `START_HERE.md` + four `.py` files + the `FILES` set
      `__init__.py:17-18`); and **what `profile_verified` actually does** —
      server-side advisory (`__init__.py:42-48`, surfaced `:75,86`, never blocking a
      Python route) but client-side enforced (`web/stills.mjs:160,167,388`).
      Every claim above is about what the Python source says; **none of it is about
      a loop-lore run**, and none is used as one. Still **not** verified, and to be
      recorded as such rather than as confirmed: what `reviewed_profile()` returns
      under a real ComfyUI launch, and whether a live ComfyUI resolves the six
      external node types at all. Those are the plugin repo's runtime questions,
      not this ticket's; the ticket records the evidence rather than assuming it,
      and a claim with no provenance is not used as if confirmed
- [ ] `bun run check` green
