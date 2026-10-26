<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: ComfyUI Lifecycle (provisioning, launch contract, portability)

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Type:** Integration Epic
**Tags:** comfyui, lifecycle, provisioning, uv, llama-swap, portability, contract-tests

## Summary

Everything loop-lore needs to make a **real ComfyUI instance** reachable for
image generation, kept deliberately separate from `epic-comfyui-plugin.md` /
`epic-comfyui-first-class-citizen.md` (which treat ComfyUI as an *HTTP client*
and a *workflow library*) and from `epic-llama-swap.md` (which owns the proxy's
own lifecycle, not the engine behind it).

ComfyUI is the one image backend that is **local by definition**. Today the
tracked llama-swap recipe at `configs/config.llama-swap.example.yaml:151` is
`python ${models_dir}/../comfyui/main.py --port ${PORT}` — a bare interpreter
from `$PATH`, a `~/models/../comfyui` path that resolves to nothing on a fresh
machine, and no record of the flags ComfyUI actually needs. The only recipe
that verifiably works lives in an uncommitted `start-local.sh` inside a dirty
clone of `Comfy-Org/ComfyUI` with no separate origin, and it differs per
developer. **Functionally unblocked on this machine, contractually unblocked
nowhere else.**

**Long-term intent (owner decision, 2026-10-18):** this work will eventually be
forked out into a **separate ComfyUI orchestration / lifecycle repository**, and
it must fork with cheap rebases. That constraint is a design requirement of this
epic, not a wish: the seam below is where the fork happens, and every rule below
exists to keep one side of it free of loop-lore's domain.

## Scope

### What this epic owns

- **Provisioning** the ComfyUI environment: a `uv sync --extra rocm|cuda`
  equivalent, per-backend extras, and the fact that ROCm torch lives *only*
  inside the ComfyUI checkout's own `.venv`
- **Custom-node dependency reconciliation** (`scripts/custom_nodes_deps.py
  install`, workspace/lock gaps such as `comfyui-impact-pack` and its bare
  `sam2` directory)
- **The launch contract**: the exact `cmd` that starts ComfyUI, which flags are
  required, which are deliberately absent, and why
- **Portability** of that contract across machines, without loop-lore ever
  writing a user's config

### The fork seam (recorded deliberately)

| Belongs to a future ComfyUI-side repo | Stays in loop-lore |
|---|---|
| Provisioning: `uv sync`, `--extra rocm` / `--extra cuda`, wheel resolution | The tracked example recipe `configs/config.llama-swap.example.yaml` |
| venv creation/location and `.venv/bin/python` resolution | `docs/spec/integrations/` prose describing the launch |
| Custom-node dependency reconciliation (`custom_nodes_deps.py install`) | Contract tests asserting the tracked recipe's shape |
| ComfyUI process launch (spawn, readiness probe, restart, log capture) | The fixed `comfyui_auto` model id |
| ComfyUI's own config format (`user/`, `__manager/config.ini`) | loop-lore's HTTP client (`src/generation/providers/comfyui.ts`) |
| Backend-specific tuning (`--cuda-device`, attention backend, `--high-ram`, `--preview-method`, `--output-directory`) | The `/comfyui` passthrough compatibility contract |

**Rule that keeps the fork cheap:** the loop-lore side of the seam contains
**no spawner, no `uv`, and no path into a ComfyUI checkout** beyond a documented,
user-owned launcher path in a committed template. The loop-lore side describes
*what the user must have running*; the ComfyUI-side repo makes it so. If a change
lands on the left column and requires an import, a type, or a config key from the
right column, it is on the wrong side of the seam.

Out of scope: forking anything today (this epic is planning only); vendoring,
installing, or maintaining ComfyUI custom nodes; managing ComfyUI's own config
format; loop-lore generating, completing, or repairing a user's llama-swap config
— `epic-llama-swap.md` states loop-lore "reads, never rewrites the user file"
and this epic honours that contract for everything it does; remote/hosted
**image** generation (see `epic-byok-api-keys.md`, which declares that gap
explicitly); renaming the `comfyui_auto` model id, which upstream
(`internal/config/model_config.go:14-15`) keys the `/comfyui` passthrough off;
and the `--fast fp16_accumulation autotune` launch flag, which the owner has
ruled out of scope — the application works for them and they remove it
themselves.

### Verified facts this epic is shaped around

- **ROCm torch exists only inside the ComfyUI checkout's own `.venv`,
  confirmed without importing it:** `torch-2.14.1+rocm7.14.dist-info` plus
  `libtorch_hip.so` / `libtorch_rocshmem.so` / `libc10_hip.so` in `torch/lib/`
  (HIP runtime, not CUDA). A bare `python main.py` therefore **cannot import
  torch**; the interpreter path is not cosmetic, it is the whole difference
  between working and not.
- **`--port` is the one flag the launch line must never lose.** It arrives via
  `"$@"`; dropping it silently binds ComfyUI's default `8188`
  (`comfy/cli_args.py:64`) while llama-swap's health probe
  (`checkEndpoint: /system_stats` on the allocated `${PORT}`) checks a port
  nobody is serving.
- **`--listen` MUST NOT be added.** Verified at `comfy/cli_args.py:63`: it is
  `nargs="?"` with `const="0.0.0.0,::"`, so a bare `--listen` binds all IPv4 and
  all IPv6. `SECURITY.md:26` puts non-default exposure on the user, and
  llama-swap's model `proxy` defaults to `http://localhost:${PORT}`
  (`internal/config/model_config.go:11`), so the localhost default is both
  correct and sufficient. The same trap shape exists on
  `--enable-cors-header` (`const="*"`) — never add either bare.
- **`--disable-auto-launch` is redundant**: `args.auto_launch` already defaults
  false (`cli_args.py:76`; `main.py:626` opens a browser only when true).
- **`--offline` is recommended by ComfyUI's own README (`README.md:81`) but is
  not passed**, so a "headless" instance here is **not actually offline** and
  the paid partner nodes can still phone home from the frontend.
- **A `comfy-launch` MACRO was explicitly considered and REJECTED.** llama-swap
  macros have no conditional or default semantics — an undefined macro is a
  hard error that fails the *entire config load*
  (`internal/config/macros.go:482-485`; `macro_in_macro_test.go:164`) — so
  "manager if installed" is inexpressible. A macro also fixes only the
  interpreter path, leaving four other per-machine variables (extra flags,
  manager on/off, attention backend, output directory) to spell out per entry:
  two edit sites instead of one. Its one good use case is a path prefix reused
  across *many* model entries; a launch command has exactly one consumer.
  **Recorded here so this option is not re-proposed.**
- **`update-local.sh` today silently half-updates**: on a dirty tree it skips
  both the `git fetch` and the `git rebase` (they sit in the same `else`
  branch) but still runs `uv sync`, so the Python environment is resynced while
  the source tree stays pinned — and the script still exits 0.
- **Remote image generation exists, but BYOK does not reach it.** The image
  surface is a separate config array, `generation.providers.sd[]`, dispatched by
  `apiFamily` in `src/generation/image-engine/index.ts:36-61` across four
  implemented backends -- `openai` (remote:
  `image-engine/openai.ts` POSTs `${baseUrl}/v1/images/generations`),
  `sdapi`, `sdcpp`, and `comfyui`. **ComfyUI itself is by definition local**
  (`image-engine/comfyui.ts` and `src/generation/providers/comfyui.ts` are both
  HTTP clients over a `baseUrl` and never spawn a process). That is the fact
  this epic cares about: the *only* backend needing a provisioned local engine
  is the one this epic provisions. BYOK's non-coverage of the image surface is
  recorded in `epic-byok-api-keys.md`.

## Acceptance Criteria

- [ ] The fork seam above is stated in the epic and every landed change can be
      filed under exactly one of its two columns; nothing crosses without an
      explicit seam amendment
- [ ] `configs/config.llama-swap.example.yaml`'s `comfyui_auto.cmd` is an
      explicit, documented launch contract — never a bare `python …/main.py`
      and never a `${models_dir}/../comfyui` path that resolves to nothing on a
      fresh machine — with the interpreter named as the ComfyUI checkout's own
      `.venv/bin/python`
- [ ] Every flag the recipe names is verified against `comfy/cli_args.py`, and
      every flag it deliberately omits says why (`--listen`,
      `--disable-auto-launch`)
- [ ] `--port ${PORT}` is asserted present by a contract test, and dropping it
      is a test failure rather than a silent bind to `8188`
- [ ] `comfyui_auto` keeps its literal id, `ttl: 0`,
      `checkEndpoint: /system_stats` and `compatibility.ignoreWebsockets: true`,
      enforced by regression test
- [ ] No change in this epic writes, completes, or repairs a user's live
      llama-swap config; the tracked template stays a template
- [ ] Provisioning, `uv sync`, custom-node reconciliation, and process spawn
      are absent from loop-lore's side of the seam — they are named as
      ComfyUI-side responsibilities, not implemented here
- [ ] `bun run plan validate` green

## Linked Tasks

- [TASK-comfyui-launch-contract-llama-swap-recipe-and-docs.md](../tickets/TASK-comfyui-launch-contract-llama-swap-recipe-and-docs.md)

## References

- `epic-llama-swap.md` — owns the proxy lifecycle and the read/never-rewrite contract
- `epic-comfyui-plugin.md` — ComfyUI as an HTTP client / `comfyui_auto` passthrough (Done)
- `epic-comfyui-first-class-citizen.md` — workflow library and UX seams
- `epic-byok-api-keys.md` — BYOK credential scope, incl. why it excludes image providers
- `TASK-external-comfyui-plugin-repo-integration-contract.md` — the external-plugin consumption contract
- `docs/spec/integrations/llm-serving.md` — where the launch prose lives


git issue: 33453cb
