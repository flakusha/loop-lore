<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: encode the accelerator × architecture variant matrix as data

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-tooling-build.md
**Caveats:** `GGML_CURL` does not exist in this tree — it is retired and silently ignored at `CMakeLists.txt:195`; emitting it is a no-op that looks successful. Cells for CUDA, ROCm, SYCL, MUSA, Metal, OpenCL, and vendor BLAS are unverified on this host, so a test may only assert the flag *strings*, never that a build succeeds. `GGML_METAL` defaults ON on Apple and is meaningless on Linux, so its default differs by platform and must not be hardcoded OFF. The merged `variants.ts` is expected to exceed the 250-code-line budget (the discriminated unions moved in from the retired `types.ts`), so it carries an explicit `// size-allow: N` directive in its first 512 characters — `scripts/check-file-size.ts` counts code lines only, so JSDoc is free.

**Summary:** Represent project × accelerator × architecture as a typed data table emitting the correct per-project CMake flags, in a single merged module.

**Acceptance Criteria:** The merged `variants.ts` exports the discriminated unions plus `variantFor`/`listVariants`, emits the correct per-project flag spellings (including the ROCm divergence), labels every cell's confidence, and ships a colocated test at >= 80% line coverage. Full checklist under [Acceptance Criteria](#acceptance-criteria).

**Context:** The two sample scripts hardcode one Vulkan flag set each and select no variant. The audit (`.tmp/external-tooling-build/report-variants.md`) established that llama.cpp uses `GGML_*` flags declared in `ggml/CMakeLists.txt` while stable-diffusion.cpp uses `SD_*` flags in its top-level `CMakeLists.txt`, and that the ROCm spelling differs (`GGML_HIP` vs `SD_HIPBLAS`) — neither accepts the other's name.

## Scope

Create `scripts/tooling/variants.ts` — **one file**, holding both the discriminated unions and the variant matrix. There is no separate types module in the final layout.

The union types are the identity of a build:

- project: `llama.cpp` | `stable-diffusion.cpp` | `llama-swap`
- accelerator: `cpu` | `vulkan` | `cuda` | `rocm` | `metal` | `blas` | `sycl` | `musa` | `opencl`
- arch: `x64` | `arm64`

`BuildVariant` carries the resolved `-D` list, the required companion settings (toolchain, `GPU_TARGETS`, `CMAKE_CUDA_ARCHITECTURES`, `MUSA_ARCHITECTURES`, `GGML_BLAS_VENDOR`, install RPATH), the per-project flag namespace, and a confidence label.

## Constraints and pitfalls

- **Flag namespaces differ and are not interchangeable.** `SD_*` forwards to `GGML_*` before `add_subdirectory(ggml)`, so passing `GGML_HIP` to stable-diffusion.cpp does nothing and passing `SD_HIPBLAS` to llama.cpp does nothing. The namespace is part of the data, not derived at call time.
- **ROCm target selection uses ROCm's own spelling.** `-DGPU_TARGETS=<gfx…>`, not `CMAKE_HIP_ARCHITECTURES`. On Windows a ROCm build additionally needs `CMAKE_C_COMPILER`/`CMAKE_CXX_COMPILER` pointed at the HIP clang and `-DCMAKE_PREFIX_PATH="$HIP_PATH"`.
- **Shared-vs-static defaults are inverted, and stable-diffusion.cpp shadows the flag.** llama.cpp defaults `BUILD_SHARED_LIBS` ON (`ggml/CMakeLists.txt:74`); stable-diffusion.cpp defaults `SD_BUILD_SHARED_LIBS` OFF (`CMakeLists.txt:95`). Worse, `CMakeLists.txt:281-297` issues `set(BUILD_SHARED_LIBS OFF)` with **no `CACHE` keyword** whenever `SD_BUILD_SHARED_GGML_LIB` is false. That is a **normal directory-scope variable, not a cache write**, and it silently shadows an explicit `-DBUILD_SHARED_LIBS=ON` for the top-level scope and everything beneath it — the exact inverse of the `CMakeCache.txt` poisoning that per-variant build directories fix. The shadow reaches ggml: `include(cmake/ggml.cmake)` is at `:332` (after the `set()`), calling `add_subdirectory` at `cmake/ggml.cmake:5`, and `add_subdirectory` copies parent normal variables into the child scope, so ggml's own `option(BUILD_SHARED_LIBS ...)` at `ggml/CMakeLists.txt:85` never creates a cache entry. The shared-vs-static decision is therefore always passed explicitly and never inherited.
- **No Linux Vulkan or Linux CPU preset exists in llama.cpp.** Vulkan presets are Windows-x64-only. Explicit flags are mandatory for the platform this epic targets.
- **stable-diffusion.cpp webp/webm prerequisites are `FATAL_ERROR`, not warnings.** `SD_WEBM` without `SD_WEBP` aborts configure (`CMakeLists.txt:178-180`), as does enabling either without either a submodule or the matching `SD_USE_SYSTEM_*` flag. Encode the pairing so the CLI cannot emit an invalid combination.
- **CI arch coverage is uneven and that is a real input.** Vulkan, CPU, and RPC have x64 *and* arm64 jobs in both projects. CUDA, ROCm, SYCL, and OpenBLAS are x64-only in CI. There is no arm64 CUDA or arm64 ROCm job anywhere, so `--arch arm64` with those accelerators is unexercised upstream and must be labelled, not silently supported.
- **llama-swap has no accelerator dimension at all** — it is a Go binary. Model it as a variant with no backend flags rather than forcing it through an accelerator selector.

## Acceptance Criteria

- [ ] `scripts/tooling/variants.ts` exports discriminated unions for project, accelerator, and arch, plus an `assertNever` exhaustiveness helper.
- [ ] Adding an accelerator without handling it in every switch is a compile error, not a silent default.
- [ ] `scripts/tooling/variants.ts` exports `variantFor(input: VariantSelector): BuildVariant` and `listVariants(): readonly BuildVariant[]`.
- [ ] The rocm cell emits `GGML_HIP=ON` for llama.cpp and `SD_HIPBLAS=ON` for stable-diffusion.cpp.
- [ ] The cpu cell emits no backend flag (both projects default CPU on) and sets `GGML_NATIVE=OFF` unless `--native` was passed.
- [ ] The blas cell requires `GGML_BLAS_VENDOR` and surfaces `BLAS_INCLUDE_DIRS`/`BLAS_LIBRARIES` as user-supplied companions.
- [ ] `SD_BUILD_SHARED_GGML_LIB` is always emitted for stable-diffusion.cpp.
- [ ] Each variant carries a confidence label: verified-by-declaration-and-CI, or lower-confidence (declared but never referenced by any workflow) for musa, openvino, hexagon, zdnn, virtgpu, et, and cann.
- [ ] A colocated `scripts/tooling/variants.test.ts` asserts the emitted flag strings for each cell — strings only, never a claim that a build ran — and reaches **>= 80% line coverage** of `variants.ts` when measured with `bun test scripts/tooling/ --coverage` (see epic caveat: `bun run test:coverage` scopes to `tests/e2e/` + `src/`, and the gate buckets all of `scripts/**` under one `scripts` module), with no waiver filed for it.
- [ ] The module passes `giwt plan check-file-size` at the 250-code-line budget, carrying an explicit `// size-allow: N` directive in its first 512 characters if — and only if — the merged file genuinely exceeds 250 code lines.
