<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI launch contract — make the tracked llama-swap recipe honest and document the flag set

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-comfyui-lifecycle
**Caveats:** portability, host-specific-paths, config-contract-drift, docs-accuracy, user-owned-provisioning, partial-failure, upstream-divergence
**Related:** TASK-comfyui-first-class-llama-swap-recipe-standalone-vs-proxy-ma.md, TASK-llama-swap-sample-config-finalization-unblocks-rotation-poli.md, TASK-llama-swap-comfyui-endpoint-support-comfyui-auto-workarounds.md, BUG-llama-swap-autostart-registers-no-llm-provider.md
**Tags:** comfyui, llama-swap, config, docs, portability
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

`configs/config.llama-swap.example.yaml:151` launches ComfyUI as
`python ${models_dir}/../comfyui/main.py --port ${PORT}` — bare `python` from
`$PATH`, a `~/models/../comfyui` path that exists on nobody's machine, and no
indication of the flags ComfyUI actually needs. The only configuration that
verifiably works today lives in an uncommitted `start-local.sh` inside a dirty
clone of `Comfy-Org/ComfyUI` with no separate origin, and differs per developer
(venv vs system python, `--enable-manager` on/off, attention backend, output
directory). Replace the placeholder line with an explicit, documented launch
contract in the tracked example plus `docs/spec/integrations/llm-serving.md`, so
a user can make the recipe correct by editing one documented line instead of
reverse-engineering someone else's shell script.

## Context

Verified 2026-10-18 against `/home/flak/git-ai/comfyui` (read-only — no `uv`,
no `pip`, no venv interpreter, no `main.py`; findings come from directory
listings and `dist-info` metadata) and `/home/flak/git-ai/llama-swap`.

**What `start-local.sh` actually does** (per-machine flags frozen in an
uncommitted script): `--cuda-device 0`, `--preview-method latent2rgb`,
`--use-ck-attention`, `--enable-manager`, `--high-ram`, and `--output-directory
"$HOME/git-ai/ai-models/Data/Images/Text2Img"`. It appends `"$@"` and `exec`s
`.venv/bin/python main.py`. `exec` is correct (the process is the PID; signals
land directly). Only `--enable-manager` appears in ComfyUI's own README
command-line table (`README.md:336-343`); the rest is local tuning that ComfyUI
documents nowhere. `--fast fp16_accumulation autotune` also appears there and
is explicitly **out of scope for this ticket** — the owner has ruled that the
application works for them and they remove the flag themselves.

**Flag analysis vs `comfy/cli_args.py`:**

- `--port` (`cli_args.py:64`, default `8188`) is the one flag the launch line
  must never drop — it arrives via `"$@"` from llama-swap's `${PORT}`
  (`macros.go:71-73` allocates it per model in stable ID order). Omitting it
  silently binds `8188` and the health probe then checks a port nobody serves.
- `--listen` (`cli_args.py:63`) **must not** be added. It defaults to
  `127.0.0.1`; bare `--listen` expands to `0.0.0.0,::`. `SECURITY.md:26` puts
  non-default exposure on the user. llama-swap's `proxy` defaults to
  `http://localhost:${PORT}` (`model_config.go:11`), so localhost binding is
  correct and sufficient. The same trap shape exists on
  `--enable-cors-header` (`const="*"`).
- `--disable-auto-launch` is redundant — `args.auto_launch` defaults false
  (`cli_args.py:76`) and `main.py:626` only opens a browser when true.
- `--offline` (`cli_args.py:220`) **is** recommended by ComfyUI's README
  (`README.md:81`, "Use `--offline` to disable the optional paid Comfy API
  nodes and force all built-in functionality to stay offline") and is **not**
  passed, so this ComfyUI is not actually offline.

**Why the current line is wrong, concretely:** ROCm torch is installed only in
`/home/flak/git-ai/comfyui/.venv` — confirmed without importing, via
`torch-2.14.1+rocm7.14.dist-info` plus `libtorch_hip.so` /
`libtorch_rocshmem.so` / `libc10_hip.so` in `torch/lib/`. The tracked line
invokes `/usr/bin/python` and would fail to import torch.

**Why not a `comfy-launch` macro** (explicitly considered and rejected — do not
re-propose): macro semantics were verified against `internal/config/macros.go` —
names `^[a-zA-Z0-9_-]+$` (`:15`), values scalar (`:39-50`), reserved
`PID`/`PORT`/`MODEL_ID` (`:52-55`), model-scope overrides global
(`model_config.go:156`), `${env.VAR}` fails the **entire config load** when unset
(`macros.go:482-485`). A macro fixes only the interpreter path — the other four
per-machine variables (extra flags, manager on/off, attention backend, output
directory) still need spelling out per entry, so the `cmd` line plus the macro
block becomes two edit sites instead of one. Macros have no
conditional/default semantics (an undefined macro is a hard error,
`macro_in_macro_test.go:164`), so "manager if installed" is inexpressible. The
`cmd`-is-one-token / `args[0]`-via-`$PATH` constraint is **not** a factor: an
absolute script path and an absolute interpreter path satisfy it identically.

**Fork seam (owner decision, 2026-10-18).** This work will eventually move to a
separate ComfyUI orchestration/lifecycle repository. What belongs on that side:
provisioning, `uv sync` and ROCm/CUDA extras, venv location and
`.venv/bin/python` resolution, custom-node dependency reconciliation, ComfyUI
process launch and readiness, and ComfyUI's own config format. What stays here:
the tracked example recipe, the `docs/spec/integrations/` prose, and the
contract tests. See `epic-comfyui-lifecycle.md` for the full two-column seam.
This ticket only touches the loop-lore column.

**Contract:** `epic-llama-swap.md` states loop-lore "reads, never rewrites the
user file" (Scope) and "proxy config never rewritten by loop-lore" (Acceptance
Criteria). Everything below edits a **committed template** and a doc — never a
live user config.

**Non-goals:** do not generate, complete, or repair a user's llama-swap config;
do not manage ComfyUI's own config format; do not attempt to make the launch
work on a machine whose ComfyUI checkout has no `.venv`; do not touch `.venv`,
`uv sync`, or anything inside `/home/flak/git-ai/comfyui`; do not rename the
`comfyui_auto` model id (upstream keys the `/comfyui` passthrough off it,
`internal/config/model_config.go:14-15`).

## Acceptance Criteria

- [ ] `configs/config.llama-swap.example.yaml` `comfyui_auto.cmd` no longer
      contains a bare `python …/main.py` invocation or a
      `${models_dir}/../comfyui` path that resolves to nothing on a fresh
      machine.
- [ ] The entry documents, in a comment block immediately above `cmd`, the exact
      flag set and *why* each is present or deliberately absent:
      `--port ${PORT}` required; `--listen` deliberately omitted (localhost
      default, `SECURITY.md:26`); `--disable-auto-launch` redundant; `--offline`
      optional-but-recommended for an unattended instance.
- [ ] The documented recipe names, in prose, the interpreter path as the ComfyUI
      checkout's own `.venv/bin/python` (never bare `python`), with a note that
      the ROCm/CUDA choice is made by `uv sync --extra rocm|cuda` and is coupled
      to device flags only by convention.
- [ ] Per-machine variability the recipe cannot fix (attention backend,
      `--fast` toggles, output directory, `--enable-manager`) is listed
      explicitly as "the user edits this one line" rather than left implicit.
- [ ] `docs/spec/integrations/llm-serving.md` ComfyUI section gains a short
      "Launching ComfyUI" subsection pointing at the tracked recipe; no invented
      flags — every flag named is verified against `comfy/cli_args.py`.
- [ ] The recipe remains overridable without editing loop-lore: a user with a
      working `start-local.sh` can substitute it for the documented line without
      any structural change to the entry.
- [ ] A regression test loads `configs/config.llama-swap.example.yaml` and
      asserts the `comfyui_auto` entry still carries
      `compatibility.ignoreWebsockets: true`, `ttl: 0`,
      `checkEndpoint: /system_stats`, and the literal model id `comfyui_auto`
      (fixed upstream, `internal/config/model_config.go:14-15` — renaming it
      breaks the `/comfyui` passthrough).
- [ ] `bun run check` and `bun run plan validate` green; no real local paths,
      credentials, or host-specific values committed.


git issue: a4f6771
