<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: pin source refs non-destructively

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-tooling-build
**Caveats:** Lexicographic tag sort is wrong for llama.cpp — `b9999` sorts after `b10000` in byte order, so `git tag | sort | tail -1` silently resolves to a stale build. llama-swap's `git describe` also under-reports: `v265` exists in the checkout but is not an ancestor of HEAD, so `describe` alone returns `v264-3-ga2796fb`. stable-diffusion.cpp's `<count>` field is not comparable across branches, so ordering must use tag creation date. A bare `'b*'` glob also matches the clone's `backup/...` refs and pollutes the sort.

**Summary:** Resolve `latest` numerically per project and check out a pinned ref without ever destroying working-tree state.

**Acceptance Criteria:** `latest` resolves correctly for all three tag schemes; a pinned ref is checked out detached; a dirty tree is refused, not reset; stable-diffusion.cpp gets its submodules initialised and llama.cpp does not; `pin.test.ts` reaches >= 80% line coverage. Full checklist under [Acceptance Criteria](#acceptance-criteria).

**Context:** Neither existing script pins anything — the built version is whatever happens to be checked out, so builds are not reproducible. The three projects use three different, incompatible tag schemes: llama.cpp uses `b<commit-count>`, stable-diffusion.cpp uses `<branch>-<count>-<short-sha>`, and llama-swap uses `v<N>` alongside legacy semver tags.

## Scope

Create `scripts/tooling/pin.ts`.

## Constraints and pitfalls

**llama.cpp — `b<commit-count>`, numeric sort is mandatory.**

```sh
# correct — git's version sort is numerically aware
git tag --list 'b[0-9]*' --sort=v:refname | tail -n1

# WRONG — byte order puts b9999 after b10000
git tag --list 'b[0-9]*' | sort | tail -n1
```

The `[0-9]*` glob matters: a bare `'b*'` also matches `backup/...` refs present in this clone.

**stable-diffusion.cpp — `<branch>-<count>-<short-sha>`.**

```sh
git tag --list '*-*-*' --sort=-creatordate | head -n1
```

Sort by tag creation date, not by the embedded count: two branches can both be at count 973 and mean different commits.

**llama-swap — `v<N>` mixed with legacy `v0.x.y` tags.**

```sh
git tag --list 'v[0-9]*' --sort=v:refname | tail -n1     # → v265
```

The `v[0-9]*` glob excludes the legacy semver tags so they cannot win the sort.

**The dirty-tree rule — refuse, never mutate.**

The repo's `AGENTS.md` forbids destructive git on the loop-lore dev checkout. The sibling checkouts are the user's own, but the cost asymmetry is identical: uncommitted work there is unrecoverable once lost, and refusing costs one clear error message.

| Condition | Behaviour |
|---|---|
| clean, HEAD already at the pinned ref | proceed; no git write at all |
| clean, HEAD elsewhere | `git fetch --tags`, then `git checkout --detach <tag>` — detached HEAD, no branch moved |
| dirty (tracked modifications) | **refuse**; log porcelain output and the pinned ref, exit non-zero. No stash, no reset, no checkout |
| untracked files only | proceed — matches the precedent in ComfyUI's `start-local.sh`, which guards with `git status --porcelain -uno` (`:12-17`) |
| submodule not initialised | stable-diffusion.cpp only: `git submodule update --init --recursive` |

Justification: a pinned build is not worth an irrecoverable checkout. `checkout --detach` on a clean tree is safe and reversible; anything touching a dirty tree is neither.

**Submodules differ per project.**

stable-diffusion.cpp declares four (`ggml`, `examples/server/frontend`, `thirdparty/libwebp`, `thirdparty/libwebm`) and every CI job checks out with `submodules: recursive`. llama.cpp's `.gitmodules` is 0 bytes — ggml is vendored in-tree — so `--recursive` is a harmless no-op and a tool that hard-fails on a missing submodule entry breaks the llama.cpp path.

## Acceptance Criteria

- [ ] `resolveRef({ project, sourceDir })` returns the newest tag for each of the three tag schemes.
- [ ] A test feeds the resolver a tag list containing `b9999` and `b10000` and asserts `b10000` wins.
- [ ] A test asserts `backup/...` refs are excluded by the glob.
- [ ] `ensureCheckout` uses `git checkout --detach` and never `reset`, `clean`, `stash`, or `checkout <branch>`.
- [ ] `ensureCheckout` refuses on tracked modifications, exits non-zero, and includes the porcelain output and the pinned ref in the error.
- [ ] `ensureCheckout` proceeds when only untracked files are present.
- [ ] Submodules are initialised for stable-diffusion.cpp and skipped for llama.cpp.
- [ ] All git shell-out uses Bun's `$` tagged template, never string concatenation.
- [ ] `resolveRef` and `ensureCheckout` carry JSDoc `@throws` on the refusal and resolution-failure paths.
- [ ] A colocated `scripts/tooling/pin.test.ts` exercises the resolver against fixture tag lists and the dirty-tree decision table without touching a real checkout, and reaches **>= 80% line coverage** of `pin.ts` when measured with `bun test scripts/tooling/ --coverage` (see epic caveat: `bun run test:coverage` scopes to `tests/e2e/` + `src/`, and the gate buckets all of `scripts/**` under one `scripts` module), with no waiver filed for it.
- [ ] The module passes `giwt plan check-file-size` at 250 code lines.
