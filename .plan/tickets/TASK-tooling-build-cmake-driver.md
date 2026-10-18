<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: CMake configure/build/install driver with a bounded `--jobs`

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-tooling-build.md
**Caveats:** `--config Release` is only meaningful for multi-config generators; it is harmless for single-config ones but duplicating `CMAKE_BUILD_TYPE` and `--config` is redundant, so set the build type once via `CMAKE_BUILD_TYPE`. CUDA and HIP configure steps invoke compiler probes that are unrunnable on this host, so any test around those cells asserts the emitted argv only.

**Summary:** Drive cmake configure, build, and install through Bun's `$`, with per-variant build trees and a memory-bounded default parallelism.

**Acceptance Criteria:** Configure, build, and install run per variant with the resolved flag set; parallelism defaults to `min(nproc, 8)`; the RPATH needed by installed binaries is set; failures name the step that failed; `cmake.test.ts` reaches >= 80% line coverage. Full checklist under [Acceptance Criteria](#acceptance-criteria).

**Context:** Both sample scripts run the same three-step `cmake -S … -B … && cmake --build … && cmake --install …` chain with no logging, no failure diagnosis, and `-j "$(nproc)"`. The audit established that unbounded parallelism is a measured risk, not a theoretical one.

## Scope

Create `scripts/tooling/cmake.ts`.

## Constraints and pitfalls

**Memory pressure is measured, not hypothetical.** `AGENTS.md:35-42` records a **11.93 GB peak total / 2.79 GB single-process** at `JOBS=1` on 52.3 GiB available, and notes the four heaviest light gates at `jobs=4` sum to ~9.4 GiB. ggml's CPU backend and CUDA device code are heavier per process than a bun gate, so `-j $(nproc)` multiplies an already-large footprint by core count.

**Default `--jobs` to `min(nproc, 8)`.** This caps the multiplier so the worst case stays inside the recorded envelope while still using every core on a small machine. Keep it user-overridable, because the right value depends on the user's RAM and core count. This is a judgement extrapolated from a bun-gate measurement, not a C++ measurement — say so in the code comment rather than implying it was measured here.

**`GGML_NATIVE` defaults OFF.** It defaults ON upstream (`ggml/CMakeLists.txt:109`) and bakes the build host's ISA into the binary. Every upstream CI job producing a distributable artifact passes `-DGGML_NATIVE=OFF`. The existing local script passes `ON`, which is acceptable for a binary that never leaves the machine and fatal for one that does.

Watch the interaction: `ggml/CMakeLists.txt:141-144` flips `INS_ENB` based on `GGML_NATIVE`, and when `INS_ENB` is ON the explicit `GGML_AVX2`/`GGML_AVX512` toggles are the only ISA control. Turning `GGML_NATIVE` OFF can therefore silently lose tuning — portable-but-slower is still the correct default, but the code should not imply otherwise.

**Install RPATH is load-bearing.** Installed binaries carry `RUNPATH=$ORIGIN:$ORIGIN/../lib64` and resolve their own libraries with no env var, but only if `bin/` sits beside `lib64/`. Set `-DCMAKE_INSTALL_RPATH='$ORIGIN:$ORIGIN/../lib64'` explicitly rather than inheriting the `$ORIGIN:$ORIGIN/..` that llama.cpp's presets use.

**Failure must name its step.** The sample scripts chain with `&&` and exit silently on the first failure, leaving an arbitrary partial tree with no indication of which step failed. Log the resolved argv before running it, and report the step by name on failure.

## Acceptance Criteria

- [ ] `configure`, `build`, and `install` accept an options object — no boolean positional parameters.
- [ ] All shell-out uses Bun's `$` tagged template; no command string is ever concatenated.
- [ ] The resolved configure argv is logged before execution.
- [ ] A non-zero exit from any of the three steps reports which step failed and exits non-zero.
- [ ] `--jobs` defaults to `min(nproc, 8)` and is overridable.
- [ ] `GGML_NATIVE` is passed OFF unless the user passed `--native`.
- [ ] `-DCMAKE_INSTALL_RPATH='$ORIGIN:$ORIGIN/../lib64'` is set on the configure step.
- [ ] The build type is set once via `CMAKE_BUILD_TYPE`; no redundant `--config Release`.
- [ ] No `console.*`; all output goes through the logger from `src/logger/`.
- [ ] A colocated `scripts/tooling/cmake.test.ts` asserts the emitted argv for the cpu and vulkan cells — argv strings only, never a claim that a compile ran — and covers the step-named failure path and the `--jobs` default, reaching **>= 80% line coverage** of `cmake.ts` under `bun run test:coverage`, so `bun run scripts/check/coverage.mjs --floor=80` passes for this module with no waiver.
- [ ] The module passes `giwt plan check-file-size` at 250 code lines.
