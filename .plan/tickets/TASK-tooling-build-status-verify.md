<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: status and verify subcommands that report, never assert

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-external-tooling-build.md
**Caveats:** `status` must probe the actual install tree rather than assume `bin/` + `lib64/`, because a relocated prefix or staging tree may differ. A prefix installed into repeatedly accumulates stale versioned libraries alongside the current one, so discovery must use the unversioned symlink. Nothing here may be worded as "verified working" — no accelerator build was executed during the audit that produced this spec, including on the user's own hardware.

**Summary:** Report which variants are installed, at which ref, with which flags — and never claim a binary was tested.

**Acceptance Criteria:** `status` lists installed variants with ref, accelerator, arch, install root, and artifacts; `verify` is machine-readable; neither claims a binary works; `status.test.ts` reaches >= 80% line coverage. Full checklist under [Acceptance Criteria](#acceptance-criteria).

**Context:** Today there is no way to ask what is installed or what a given binary was built from. The llama-swap config and the build scripts are two disconnected halves of one setup: the config assumes `llama-server` and `sd-server` are already on `PATH` with their RPATH-satisfied libs, and nothing records which build put them there.

## Scope

Create `scripts/tooling/status.ts`.

## Constraints and pitfalls

**Probe, do not assume.** `bin/` + `lib64/` (+ `include/`, `cmake/`, `pkgconfig/`) is what a local `cmake --install` into a fresh prefix produces. Anything else may differ. `status` reads the tree and reports what is there.

**Discover artifacts via the unversioned symlink.** The existing `llama.cpp/build-vk/lib64/` holds `libggml-vulkan.so.0.15.3` through `libggml-vulkan.so.0.27.0` side by side, accumulated across repeated installs. Globbing `lib*/libggml-vulkan.so.0.*` and taking the highest numerically picks up whatever a past build left behind. Follow `libggml-vulkan.so` instead.

**Report provenance, never verification.** The full accelerator matrix was derived from `option()` declarations plus CI workflow invocations; no configure, build, or run was executed on any accelerator, and the host has no CUDA, ROCm, or oneAPI toolchain. So `verify` reports what is on disk — ref, flags, artifact paths, timestamps — and its wording must not imply a binary was exercised. A missing artifact is a fact it may report; a broken binary is not something it may claim to know.

**Record the source ref.** This is the gap that made the original scripts unreproducible: neither pins a version, so the built artifact's provenance is unknown. `status` should record which ref each installed tree came from so the gap does not recur.

## Acceptance Criteria

- [ ] `status` lists each installed variant with project, ref, accelerator, arch, install root, and artifact list.
- [ ] `status` probes the real tree; it does not assume `bin/` + `lib64/` exists.
- [ ] Artifact discovery follows the unversioned `.so` symlink rather than globbing version suffixes.
- [ ] `verify --json` emits a machine-readable document with the same fields.
- [ ] No output from either subcommand states or implies that a binary was run or tested.
- [ ] Each reported artifact carries a source ref or an explicit "unknown" marker.
- [ ] Neither subcommand launches, executes, or loads any built binary.
- [ ] A colocated `scripts/tooling/status.test.ts` runs both subcommands against a fixture install tree (including a prefix with stale versioned libraries alongside the unversioned symlink) and asserts the JSON field set, reaching **>= 80% line coverage** of `status.ts` when measured with `bun test scripts/tooling/ --coverage` (see epic caveat: `bun run test:coverage` scopes to `tests/e2e/` + `src/`, and the gate buckets all of `scripts/**` under one `scripts` module), with no waiver filed for it.
- [ ] The module passes `giwt plan check-file-size` at 250 code lines.
