<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: build llama-swap from Go, not CMake

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-external-tooling-build.md
**Caveats:** `make linux-amd64` depends on the `ui` target, which runs `npm install` and `npm run build` in `ui/` — a Node toolchain plus a network fetch that the user may not have. The Makefile stamps the version from `git describe` and appends `+` to the commit hash when the tree is dirty (`Makefile:6-12`), so building from a dirty tree bakes a permanent `+` marker into the binary. `git describe` also under-reports: `v265` exists in the checkout but is not an ancestor of HEAD.

**Summary:** Give llama-swap its own build path via `go build` with explicit version stamping and an explicit web-UI decision.

**Acceptance Criteria:** llama-swap builds via `go build` with ldflags version stamping; the embed-UI choice is an explicit flag; `all` and `release` are not used; `go-build.test.ts` reaches >= 80% line coverage. Full checklist under [Acceptance Criteria](#acceptance-criteria).

**Context:** llama-swap is a Go project with no CMake. Its Makefile's default target `all` also builds a macOS binary and two `simple-responder` binaries that are not wanted, and its `release` target is a *tagging* target that refuses on a dirty tree — it compiles nothing. Under build-only scope the correct target is `linux-amd64` or `linux-arm64`.

## Scope

Create `scripts/tooling/go-build.ts`.

## Constraints and pitfalls

**`release` is a tagging target, not a build target.** It computes the next `v<N>` tag, refuses if `git status --porcelain` is non-empty, and refuses unless `CHANGELOG.md` has a matching `## v<N>` heading (`Makefile:109-125`). It compiles nothing and it mutates the repo. Never invoke it from a build-only tool.

**`all` builds more than wanted.** `all: mac linux simple-responder` (`Makefile:18`) builds a darwin binary and two helper binaries. Use `linux-amd64` or `linux-arm64` explicitly.

**The `ui` dependency is a real trap.** Both `linux-amd64` and `linux-arm64` depend on the `ui` target, which is `cd ui && npm install` then `npm run build` (`Makefile:65-71`), feeding `internal/server/ui_dist` for the `embed_ui` build tag.

There is a legitimate build-only escape: build **without** `-tags embed_ui`, i.e. plain `go build ./cmd/llama-swap`. That skips the Node dependency entirely and yields a binary without the embedded web playground. Which of the two the tool does must be an explicit, documented flag — not an accident discovered when `npm` is missing.

**Version stamping.** The Makefile uses:

```
go build -tags embed_ui \
  -ldflags="-X main.commit=${GIT_HASH} -X main.version=${GIT_VERSION} -X main.date=${BUILD_DATE}" \
  -o build/llama-swap-linux-amd64
```

Reproduce the `-X` stamps so `--version` reports something meaningful. `GIT_VERSION` comes from `git describe --abbrev=6 --tags` and `GIT_HASH` gets a `+` suffix when the tree is dirty (`Makefile:6-12`).

**llama-swap has no accelerator dimension.** It is a Go binary; model it as a variant with no backend flags rather than forcing it through the accelerator selector.

## Acceptance Criteria

- [ ] `buildLlamaSwap` shells out with Bun's `$` tagged template.
- [ ] The output path is derived from `--install-root`, not a hardcoded `build/`.
- [ ] `-ldflags` stamps commit, version, and date, with the version taken from the resolved pinned ref rather than bare `git describe`.
- [ ] `--embed-ui` (default off) adds `-tags embed_ui`; without it the build runs no npm step.
- [ ] `all` and `release` are never invoked.
- [ ] A colocated `scripts/tooling/go-build.test.ts` asserts the emitted argv for both embed-UI states and both arches — argv only, never a claim that a Go build ran — reaching **>= 80% line coverage** of `go-build.ts` when measured with `bun test scripts/tooling/ --coverage` (see epic caveat: `bun run test:coverage` scopes to `tests/e2e/` + `src/`, and the gate buckets all of `scripts/**` under one `scripts` module), with no waiver filed for it.
- [ ] llama-swap is reachable without supplying `--accelerator`.
- [ ] The module passes `giwt plan check-file-size` at 250 code lines.
