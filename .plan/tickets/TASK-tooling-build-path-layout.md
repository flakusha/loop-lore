<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: per-variant build directories, install root, and PATH symlinks

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-external-tooling-build.md
**Caveats:** CMake caches every `option()` result and does not reset a variable on a re-configure that omits it, so a shared build tree yields a successful build with the wrong backend and no visible error. Separately, stable-diffusion.cpp's `CMakeLists.txt:281-297` sets `BUILD_SHARED_LIBS OFF` with no `CACHE` keyword — a **normal directory-scope variable** that shadows an explicit `-DBUILD_SHARED_LIBS=ON` — which per-variant directories do *not* fix; that is handled by always passing the shared-vs-static flags explicitly. A prefix that has been installed into repeatedly accumulates stale versioned libraries — the existing `llama.cpp/build-vk/lib64/` holds `libggml-vulkan.so.0.15.3` alongside the current one — so artifact discovery must use the unversioned symlink.

**Summary:** Key build trees by project × accelerator × architecture, make the install root a flag, and create PATH symlinks in one merged module.

**Acceptance Criteria:** Build directories are per variant; the install root is a flag with a sane default; an optional link directory holds PATH symlinks; `bin/` and `lib64/` are treated as inseparable; `paths.test.ts` reaches >= 80% line coverage. Full checklist under [Acceptance Criteria](#acceptance-criteria).

**Context:** Both sample scripts write to a single global `/tmp/<project>` build tree that collides across checkouts and across users, and install to a prefix relative to `$PWD`, so running from the wrong directory silently targets the wrong tree. A shared build tree is not merely untidy: it produces silently wrong binaries.

## Scope

Create `scripts/tooling/paths.ts` — **one file**, holding both the directory layout and the PATH symlink farm. There is no separate link module in the final layout. The merged file is expected to stay near the 250-code-line budget; if it genuinely exceeds it, carry an explicit `// size-allow: N` directive in the first 512 characters.

## Constraints and pitfalls

**Per-variant build trees are non-negotiable, not tidiness.**

CMake writes `option()` results to `CMakeCache.txt` and does not reset a variable on a re-configure that omits it. Reusing one directory across accelerators means the second build silently keeps the first's `GGML_VULKAN=ON`, or keeps `GGML_CUDA=ON` and drags the CUDA toolkit into a Vulkan build. The build *succeeds* and the binary has the wrong backend.

Upstream agrees independently: llama.cpp's `CMakePresets.json` gives every preset `binaryDir: ${sourceDir}/build-${presetName}`.

Layout:

```
<temp-root>/<project>/<accelerator>-<arch>/build
<temp-root>/<project>/<accelerator>-<arch>/install
```

**The install root is a flag, not a constant.** The user symlinks installed binaries into `~/.local/bin/`, but that is one local machine's practice, not a universal layout. So `--install-root` carries a sane default and the `~/.local/bin/` habit is expressed as a *separate, optional* `--link-dir`. Omitting `--link-dir` creates no symlinks at all.

**`bin/` and `lib64/` must stay adjacent.** Installed binaries resolve their libraries via `RUNPATH=$ORIGIN:$ORIGIN/../lib64` with no environment variable. Separating the directories breaks every binary. Treat the pair as one unit: never link a single binary out of context in a way that loses the relationship.

**Artifact discovery must handle prefix accumulation.** A prefix installed into repeatedly keeps stale versioned libraries alongside the current one. Discover `libggml-vulkan.so` (the unversioned symlink) rather than globbing `lib*/libggml-vulkan.so.0.*` and taking the numerically highest — the latter picks up whatever a past build left behind.

**Assume nothing about the install layout.** `bin/` + `lib64/` is what a local `cmake --install` into a fresh prefix produces. A relocated prefix, a `DESTDIR` staging tree, or any other acquisition route may not. Probe the actual tree.

## Acceptance Criteria

- [ ] `buildDirFor` and `installRootFor` key on project, accelerator, and arch; two accelerators never resolve to the same directory.
- [ ] `--install-root` overrides the default `<temp-root>/<project>/<accelerator>-<arch>/install`.
- [ ] `--link-dir` is optional; when absent, `linkInstalledBinaries` creates nothing and returns an empty list.
- [ ] `linkInstalledBinaries` refuses to overwrite an existing symlink unless `--force` is passed.
- [ ] Artifact discovery resolves the unversioned `.so` symlink and does not glob by version suffix.
- [ ] A path helper documents that `bin/` and `lib64/` are inseparable, and the linking code never produces a tree that separates them.
- [ ] A colocated `scripts/tooling/paths.test.ts` asserts that switching accelerator yields a different build directory, that the same variant always yields the same one, the optional-link-dir behaviour, and the refuse-unless-forced symlink path — all against a temp directory, never a real install root — reaching **>= 80% line coverage** of `paths.ts` under `bun run test:coverage`, so `bun run scripts/check/coverage.mjs --floor=80` passes for this module with no waiver.
- [ ] The module passes `giwt plan check-file-size` at the 250-code-line budget, carrying an explicit `// size-allow: N` directive in its first 512 characters if — and only if — the merged file genuinely exceeds 250 code lines.
