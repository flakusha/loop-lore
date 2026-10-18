<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: External tooling build CLI (llama.cpp, stable-diffusion.cpp, llama-swap)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Type:** Infrastructure
**Tags:** tooling, build, llama-swap, llama.cpp, stable-diffusion, provisioning
**Overview:** Replace the two hand-maintained shell build scripts with a build-only Bun/TypeScript provisioning CLI that selects project × accelerator × architecture, pins a source ref, builds from source into a user-selectable install root, and reports status. Build-only: no release-asset download.

## Summary

Two 27-line shell scripts (`llama-build-vk.sh`, `stable-diffusion-build-vk.sh`) each hardcode eleven CMake `-D` flags, a `/tmp` build tree that collides globally, and an install prefix relative to `$PWD`. They select no variant at all — GPU vs CPU is decided by a single unconditional `-DGGML_VULKAN=ON` / `-DSD_VULKAN=ON`, and which physical GPU a model lands on is decided elsewhere entirely (in the llama-swap config, by hand).

This epic replaces them with one build-only CLI under `scripts/tooling/`, written in Bun/TypeScript to match the repo (which tracks zero `.sh` files and uses Bun for all scripting). The CLI makes project, accelerator, architecture, install root, source ref, and parallelism explicit and selectable; keeps a per-variant build tree so a variant switch cannot be poisoned by a stale CMake cache; and stays deliberately ignorant of which physical GPU is which.

Scope is **build only**. Downloading prebuilt GitHub release assets is deferred and deliberately absent from this design.

## Scope

The CLI covers exactly three projects and the work needed to compile them from a local checkout:

- **llama.cpp** — CMake; backend flags are `GGML_*`, declared in `ggml/CMakeLists.txt`.
- **stable-diffusion.cpp** — CMake; backend flags are `SD_*`, declared in the top-level `CMakeLists.txt` and forwarded to `GGML_*`.
- **llama-swap** — Go; built with `go build`, not CMake.

Each accelerator × architecture cell is emitted as an explicit `-D` flag set. Because llama.cpp has no Linux CPU or Linux Vulkan CMake preset (its Vulkan presets are Windows-x64-only, `CMakePresets.json`), explicit flags are mandatory — there is no preset to lean on for the platform that matters here.

The install root is a flag with a sane default, not a hardcoded path. The existing habit of symlinking installed binaries into `~/.local/bin/` is one local practice, not a universal layout, so it is expressed as an *optional separate link directory* rather than baked into the install prefix. The `bin/` + `lib64/` pairing a local `cmake --install` produces is preserved, because installed binaries carry `RUNPATH=$ORIGIN:$ORIGIN/../lib64` and break if the two directories are separated.

## Module layout — exactly eight files

Two modules were folded away to keep the surface small: the discriminated unions drafted as a separate `types.ts` live in `variants.ts`, and the symlink farm drafted as a separate `link.ts` lives in `paths.ts`. No other file is added.

| Module | ~LOC | Responsibility |
|---|---|---|
| `scripts/tooling/cli.ts` | 180 | Optique parser tree + `runScript` wiring |
| `scripts/tooling/variants.ts` | 260 | discriminated unions **+** the variant matrix as data (merged) |
| `scripts/tooling/pin.ts` | 210 | ref resolution, detached checkout, dirty-tree refusal, submodule init |
| `scripts/tooling/paths.ts` | 160 | build/install/link dir layout, PATH symlinks (merged) |
| `scripts/tooling/cmake.ts` | 150 | configure/build/install via Bun's `$`, RPATH, `--jobs` cap |
| `scripts/tooling/go-build.ts` | 120 | llama-swap's `go build` path |
| `scripts/tooling/status.ts` | 180 | status/verify |
| `scripts/tooling/main.ts` | 140 | subcommand dispatch |

`variants.ts` is expected to exceed the 250-code-line budget after the merge. That is acceptable ONLY with an explicit `// size-allow: N` directive in the first 512 characters — `scripts/check-file-size.ts` counts code lines only, so comments and JSDoc are free. If the merged file genuinely fits under 250 code lines, no directive is added.

**Out of scope:** downloading prebuilt release assets from GitHub (deferred; no download mode is designed or specified here), downloading models, installing system toolchains or accelerator SDKs, GPU enumeration or device assignment, rewriting the llama-swap config, launching or supervising any server, and ComfyUI provisioning.

## Constraints and pitfalls

Each item below is a constraint the implementation must honour, discovered during the audit recorded in `.tmp/external-tooling-build/report-variants.md`. None of them is optional.

### Per-variant build directories — CMakeCache poisoning

CMake writes every `option()` result into `CMakeCache.txt` at configure time and **does not reset a variable on a re-configure that omits it**. Reusing one build directory across accelerators therefore means the second build silently inherits the first's `GGML_VULKAN=ON`, or drags the CUDA toolkit into a Vulkan build. The build succeeds and produces a binary with the wrong backend; nothing in the output reveals it.

Upstream agrees independently: llama.cpp's own `CMakePresets.json` gives every preset a distinct `binaryDir` of `${sourceDir}/build-${presetName}`.

### A separate, related footgun: `BUILD_SHARED_LIBS` is silently shadowed, not cached

stable-diffusion.cpp contains a second mechanism that is easy to confuse with the first and worth stating precisely:

```
CMakeLists.txt:281-297   if(SD_BUILD_SHARED_LIBS)
                            if(NOT SD_BUILD_SHARED_GGML_LIB)
                                set(BUILD_SHARED_LIBS OFF)     # no CACHE keyword
                            endif()
                            add_library(${SD_LIB} SHARED ...)
                        else()
                            if(NOT SD_BUILD_SHARED_GGML_LIB)
                                set(BUILD_SHARED_LIBS OFF)     # no CACHE keyword
                            endif()
                            add_library(${SD_LIB} STATIC ...)
                        endif()
```

That is a **SHADOWING normal directory-scope variable, not a cache write** — `set()` with no `CACHE` keyword does not touch `CMakeCache.txt`. The two mechanisms are distinct and per-variant build directories fix only the first: the dangerous direction here is the inverse of a cache poisoning. A user who passes `-DBUILD_SHARED_LIBS=ON` (exactly what the existing `stable-diffusion-build-vk.sh` line 16 does) has that choice **silently overridden to OFF**, because the normal variable shadows the `-D` cache entry for the top-level scope and everything configured beneath it.

The shadow does reach ggml. `include(cmake/ggml.cmake)` sits at `CMakeLists.txt:332` — *after* the `set()` at line 285/294 — and that file calls `add_subdirectory` at `cmake/ggml.cmake:5`. `add_subdirectory` copies the parent's normal variables into the child scope, so ggml inherits `BUILD_SHARED_LIBS=OFF`, and ggml's own `option(BUILD_SHARED_LIBS ...)` declaration at `ggml/CMakeLists.txt:85` does not create a cache entry because a normal variable of that name already shadows it.

**Requirement:** the shared-vs-static decision is always passed explicitly for stable-diffusion.cpp — never inherited, never assumed. This is precisely why the existing script pairs `-DSD_BUILD_SHARED_LIBS=ON` with `-DSD_BUILD_SHARED_GGML_LIB=ON`; that pairing is not incidental and the tooling must preserve it by default rather than leave it to the user to rediscover.

**Requirement:** the build tree is keyed by project × accelerator × architecture. Upstream tests additionally pass `GGML_NATIVE=OFF` with a Vulkan SDK toolchain, so the toolchain selection is per-variant too.

### `GGML_NATIVE` destroys portability

`GGML_NATIVE` defaults **ON** (`ggml/CMakeLists.txt:109`) and bakes the build host's ISA into the binary. Every upstream CI job producing a distributable artifact passes `-DGGML_NATIVE=OFF` explicitly. The existing local script passes `-DGGML_NATIVE=ON`, which is acceptable for a binary that never leaves the machine and fatal for one that does.

**Requirement:** a `--native` toggle, **defaulting OFF**. Portability is the default; host-specific tuning is opt-in. The knob is kept because on a known-single-host install it is a real speed win — the calibration knob, not dead code.

### `--jobs` memory pressure

The repo's own `AGENTS.md:35-42` records a measured **11.93 GB peak total / 2.79 GB single-process** at `JOBS=1`, on 52.3 GiB available. Both existing scripts pass `-j "$(nproc)"`, multiplying an already-large per-process footprint by core count. ggml's CPU backend and CUDA device code are heavier per process than a bun gate.

**Requirement:** `--jobs`, default `min(nproc, 8)` — caps the multiplier so the worst case stays inside the recorded envelope while still using all cores on a small machine. Overridable, because the right value depends on the user's RAM and core count.

### No Linux CPU/Vulkan preset in llama.cpp

`CMakePresets.json` has CPU presets (`x64-linux-gcc-*`, gcc/g++, no backend flag) and Vulkan presets that are **Windows-x64 only**. There is no Linux Vulkan preset and no Linux CPU preset carrying a backend flag.

**Requirement:** every variant is expressed as an explicit `-D` set. Preset use is not available for the platform that matters.

### Submodules differ

llama.cpp vendors ggml in-tree; its `.gitmodules` is 0 bytes and nothing needs initialising. stable-diffusion.cpp declares four submodules (`ggml`, `examples/server/frontend`, `thirdparty/libwebp`, `thirdparty/libwebm`) and every CI job checks out with `submodules: recursive`.

**Requirement:** the tool runs `git submodule update --init --recursive` for stable-diffusion.cpp and none for llama.cpp. A tool that hard-fails on a missing `.gitmodules` entry breaks the llama.cpp path.

### Flag namespaces differ, including the HIP spelling

llama.cpp is `GGML_*`; stable-diffusion.cpp is `SD_*` and forwards to `GGML_*` before `add_subdirectory(ggml)`. The highest-risk divergence is ROCm:

| | ROCm flag |
|---|---|
| llama.cpp | `-DGGML_HIP=ON` |
| stable-diffusion.cpp | `-DSD_HIPBLAS=ON` |

Neither accepts the other's name; `SD_HIP` does not exist. **Requirement:** the variant model carries the flag names as data, keyed per project, so a single accelerator selector emits the correct spelling. Shared-vs-static defaults are also inverted between the projects — llama.cpp defaults `BUILD_SHARED_LIBS` ON, stable-diffusion.cpp defaults `SD_BUILD_SHARED_LIBS` OFF — and `SD_BUILD_SHARED_GGML_LIB` is a separate knob that must always be passed explicitly.

### No accelerator except the user's is verifiable on this host

The host has no CUDA, ROCm, or oneAPI toolchain. And more broadly: **the audit executed no configure, build, or run on any accelerator, including CPU and Vulkan.** The entire variant matrix is derived from `option()` declarations plus CI workflow invocations, and is UNVERIFIED-BY-CONSTRUCTION.

**Requirement:** the CLI reports provenance rather than claiming verification. `status` reports what is on disk; it never asserts a binary works. Cells for CUDA, ROCm, SYCL, MUSA, Metal, OpenCL, and the vendor BLAS path ship labelled as unverified-on-this-host, and the documentation states that the first real build is the first execution of those flag combinations.

## Non-goals (deliberate design decisions)

- **No GPU detection or device assignment.** Vulkan enumeration on the user's box is unstable across machines (`0:cpu,1:igpu,2:gpu` / `0:gpu,1:cpu` / `0:gpu,1:igpu,2:cpu`) and CUDA and ROCm number differently again. The build tooling is completely ignorant of which physical GPU is which. Device selection lives in the llama-swap config, where reference values are edited by hand.
- **No download.** Build-only scope.
- **No llama-swap config rewriting.** loop-lore reads the user config and never rewrites it.
- **No destructive git.** See TASK-tooling-build-ref-pinning.

## Acceptance Criteria

- [ ] A single CLI under `scripts/tooling/` builds llama.cpp and stable-diffusion.cpp for a selected project × accelerator × architecture, from an explicit `-D` flag set with no shell script involved.
- [ ] llama-swap is built through its own path (`go build`, not CMake), and the choice of whether to embed the web UI is explicit rather than incidental.
- [ ] The install root is a flag with a sane default; the PATH-link directory is a separate, optional flag.
- [ ] Each variant builds in its own directory keyed by project × accelerator × architecture; switching accelerator cannot inherit the previous accelerator's CMake cache.
- [ ] `--native` defaults OFF and `--jobs` defaults to `min(nproc, 8)`; both are overridable.
- [ ] `--dry-run` prints the resolved plan — ref, flags, directories, commands — without executing.
- [ ] A pinned ref is checked out non-destructively; a checkout with tracked modifications is refused rather than reset or stashed.
- [ ] stable-diffusion.cpp gets `git submodule update --init --recursive`; llama.cpp does not.
- [ ] `status`/`verify` report installed variants (ref, accelerator, arch, install root, artifacts) and never claim a binary was tested.
- [ ] The documentation states plainly which accelerators are unverified on this host.
- [ ] The implementation is exactly eight modules under `scripts/tooling/` (`cli`, `variants`, `pin`, `paths`, `cmake`, `go-build`, `status`, `main`) with no separate `types.ts` and no separate `link.ts`.
- [ ] Every file passes `giwt plan check-file-size` at the 250-line code budget, with an explicit `// size-allow: N` in the first 512 characters of `variants.ts` if the merged file genuinely exceeds it.
- [ ] **Every module under `scripts/tooling/` reaches >= 80% line coverage**, verified per-file by `bun run scripts/check/coverage.mjs --floor=80`. Each module ships a colocated `*.test.ts`; no waiver is filed for any of them.
- [ ] The `scripts/tooling/` test files are measured, not skipped. Caveat recorded here because it is a real limit of the current gate, not an assumption: `bun run test:coverage` scopes its path list to `tests/e2e/` and `src/`, so `scripts/` tests are excluded from that run; and `scripts/check/coverage.mjs` buckets every `scripts/**` file under a single `scripts` module (`scripts/check/coverage/lcov.mjs`), so it floors the aggregate, not each tooling file individually. Per-file enforcement therefore needs either a targeted `bun test scripts/tooling/ --coverage` run whose lcov is fed to the gate, or a waiver entry scoped to the aggregate.
- [ ] No GPU detection, no release-asset download, and no llama-swap config rewriting anywhere in the implementation.

## Linked Tasks

- [TASK-tooling-build-variant-matrix](../tickets/TASK-tooling-build-variant-matrix.md)
- [TASK-tooling-build-ref-pinning](../tickets/TASK-tooling-build-ref-pinning.md)
- [TASK-tooling-build-cmake-driver](../tickets/TASK-tooling-build-cmake-driver.md)
- [TASK-tooling-build-path-layout](../tickets/TASK-tooling-build-path-layout.md)
- [TASK-tooling-build-llama-swap-go-build](../tickets/TASK-tooling-build-llama-swap-go-build.md)
- [TASK-tooling-build-cli-surface](../tickets/TASK-tooling-build-cli-surface.md)
- [TASK-tooling-build-status-verify](../tickets/TASK-tooling-build-status-verify.md)
- [TASK-tooling-build-unverified-matrix-docs](../tickets/TASK-tooling-build-unverified-matrix-docs.md)
