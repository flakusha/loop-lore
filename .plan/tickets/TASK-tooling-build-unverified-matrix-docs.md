<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: document the variant matrix and its unverified status

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-external-tooling-build
**Caveats:** CI exercise is a weak signal, not proof — CI compiles far more than it runs, so a broken flag can still pass a compile-only job. CUDA, ROCm, and SYCL have no arm64 job in either project, so those arch cells have no upstream support at all. Lower-confidence cells (musa, openvino, hexagon, zdnn, virtgpu, et, cann) are declared but never referenced by any workflow. A prefix that has been installed into repeatedly holds stale versioned libraries, so any documented artifact-discovery instruction must use the unversioned symlink.

**Summary:** Publish the accelerator × architecture matrix with per-cell provenance, CI evidence, and an explicit UNVERIFIED label on everything not executed.

**Acceptance Criteria:** The matrix ships as documentation with per-cell evidence citations, per-cell CI arch coverage, a confidence label, and a standing statement that no accelerator was built. Full checklist under [Acceptance Criteria](#acceptance-criteria).

**Context:** The audit in `.tmp/external-tooling-build/report-variants.md` produced a complete matrix, but it is a reading of declarations and CI text, not a record of successful builds. The host has no CUDA, ROCm, or oneAPI toolchain, so those cells are unexecutable here by construction. That provenance has to survive into the shipped documentation, or the matrix will be read as tested.

## Scope

Write the documentation. No code beyond what it describes — this ticket introduces no `scripts/tooling/*.ts` module, so no per-module coverage criterion applies to it.

## Constraints and pitfalls

**The provenance statement is the deliverable, not a disclaimer.** The matrix was derived from `option()` declarations plus CI workflow invocations with `file:line` citations. **No configure, build, or run was executed on any accelerator — including CPU and Vulkan, which the user's machine could run.** The first real build of any cell is the first execution of that flag combination. State it once, prominently, and do not soften it per-cell.

**Confidence labels must be earned.** The only signal available is CI exercise:

- **Verified-by-declaration-and-CI** — configured and built by an upstream workflow on every push (vulkan, cuda, rocm, metal, sycl, cpu, blas).
- **Lower-confidence** — appears in an `option()` but is never named by any workflow: musa, openvino, hexagon, zdnn, virtgpu, et, et_sysemu, cann. sd's `SD_OPENCL` falls here too.

**Per-cell arch coverage is a first-class column**, not a footnote. Vulkan, CPU, and RPC have x64 *and* arm64 jobs in both projects. CUDA, ROCm, SYCL, and OpenBLAS are x64-only. There is no arm64 CUDA or arm64 ROCm job anywhere in either project, and no Linux OpenBLAS job at all (the OpenBLAS evidence is Windows-x64 and MSYS only). Those are real gaps in upstream support, and a user selecting `--arch arm64 --accelerator cuda` should learn that from the docs rather than from a failed build.

**Document the sharpest divergences, because they are the ones that bite:**

| | llama.cpp | stable-diffusion.cpp |
|---|---|---|
| namespace | `GGML_*` (`ggml/CMakeLists.txt`) | `SD_*` (top-level `CMakeLists.txt`) |
| ROCm | `-DGGML_HIP=ON` | `-DSD_HIPBLAS=ON` |
| shared default | `BUILD_SHARED_LIBS` ON | `SD_BUILD_SHARED_LIBS` OFF |
| ggml | vendored in-tree, no submodule | 4 submodules, `--init --recursive` |
| Linux Vulkan preset | none | n/a |

Neither project accepts the other's ROCm flag name. `SD_HIP` does not exist. `GGML_CURL` does not exist — it is retired and silently ignored at `CMakeLists.txt:195`, so emitting it looks successful and does nothing.

**Document the constraints that shape behaviour, not just the flags:** per-variant build directories against CMakeCache poisoning, the distinct `BUILD_SHARED_LIBS` **shadowing** footgun (a normal directory-scope variable with no `CACHE` keyword at `CMakeLists.txt:281-297` — explicitly *not* the `CMakeCache.txt` mechanism), `GGML_NATIVE` defaulting OFF for portability, the `--jobs` memory bound, and that `bin/` + `lib64/` are inseparable because of `$ORIGIN:$ORIGIN/../lib64`.

## Acceptance Criteria

- [ ] The matrix ships as documentation with a table row per project × accelerator × architecture.
- [ ] Every cell cites its `option()` declaration as `file:line`, and cites a CI invocation where one exists.
- [ ] Every cell carries a confidence label and its CI arch coverage.
- [ ] A standing provenance statement appears before the matrix: derived from declarations and CI; no accelerator built.
- [ ] The doc states that CUDA, ROCm, SYCL, and MUSA are additionally unexecutable on this host for lack of a toolchain.
- [ ] The ROCm spelling divergence is documented as a table row, with the note that neither project accepts the other's name.
- [ ] The submodule divergence is documented with the exact `git submodule update --init --recursive` command and the note that llama.cpp needs none.
- [ ] The doc records that `GGML_CURL` does not exist and is silently ignored.
- [ ] The doc lists the lower-confidence cells as a named group.
- [ ] The doc names the no-upstream-support gaps: no arm64 CUDA, no arm64 ROCm, no Linux OpenBLAS job.
- [ ] The doc states the stable-diffusion.cpp `BUILD_SHARED_LIBS` footgun as a **shadowing normal variable** and explicitly distinguishes it from the CMakeCache mechanism that per-variant build directories fix.
- [ ] No cell is described as tested, verified, or working.
