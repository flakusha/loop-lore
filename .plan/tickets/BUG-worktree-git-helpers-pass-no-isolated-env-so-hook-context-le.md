<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: worktree git helpers pass no isolated env, so hook context leaks into every call

**Summary:** scripts/worktree/utils/git.ts:121-134 runs git with a bare spawn and no env at all:
**Context:** (none captured)
**Acceptance Criteria:** Implementation complete, tests passing, documentation updated.

**Status:** Done
**Priority:** high
**Effort:** Small

**Summary:**

scripts/worktree/utils/git.ts:121-134 runs git with a bare spawn and no env at all:

    const result = Bun.spawnSync(["git", "-C", repoRoot, ...args,], { stdout: "pipe", stderr: "pipe", },);

Every GIT_* hook-scoped var (GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE, GIT_OBJECT_DIRECTORY, GIT_ALTERNATE_OBJECT_DIRECTORIES, GIT_COMMON_DIR, GIT_QUARANTINE_PATH) is inherited verbatim by the child. Both gitSync and gitSyncQuiet pass `-C <repoRoot>` but the inherited context can still redirect what git actually operates on — a relative GIT_INDEX_FILE resolves against the worktree, and GIT_DIR inherited from a hook points git at the hook's repo rather than repoRoot.

This is exactly the bug giwt already fixed upstream. giwt/src/utils/git.ts:125-138 documents the reasoning: 'GIT_* context vars leak into giwt whenever it runs inside a git hook — and giwt's job is to run inside hooks ... at best redundant and at worst fatal.' The fork has the git.ts port but not the isolatedGitEnv port, which is one of the divergences the fork-retirement ticket (c6f5f7868) records.

Compounding factor: loop-lore's finalize is routinely invoked from git hooks, and the OMP_*/PI_*/ENGRAM_*/MNEMO_* agent session vars leak the same way.


Evidence: scripts/worktree/utils/git.ts:121-134. Upstream reference: giwt/src/utils/git.ts:125-138.

## Acceptance Criteria

- [x] An isolatedGitEnv equivalent exists in scripts/worktree/utils/git.ts and is used by gitSync and gitSyncQuiet
- [x] GIT_* vars are stripped per call
- [x] The docstring states the hook-context reason, matching giwt's wording
- [x] A test seeds GIT_INDEX_FILE and asserts the child git resolves against repoRoot, not the seeded path
- [x] Tracked against the fork-retirement migration ticket (c6f5f7868) so the divergence closes rather than being ported forward


## Resolution (2026-09-29)

`isolatedGitEnv()` added to `scripts/worktree/utils/git.ts` and wired into
`gitSync`/`gitSyncQuiet` plus every git-child spawn across the fork — audited
mechanically, not by eye: 40 git spawns carry an isolated env, 0 do not. That
covers `finalize`, `rebase`, `abort`, `merge`, `remove`, `cleanup`, `create`,
`new-branch`, `prs`, `commit`, and `commit-branch`.

Two spawn classes deliberately keep the inherited env: `gpg --list-secret-keys`
(gpg reads no `GIT_`/`OMP_` var) and the `gh`/`which` calls in `prs.ts`.

`commit.ts` and `commit-branch.ts` were the sharpest case: both forwarded
`...process.env` wholesale while setting `GIT_COMMITTER_NAME`/`_EMAIL`. They now
spread `isolatedGitEnv()` and re-set only the identity the command owns, so the
committer override survives while a hook's `GIT_INDEX_FILE` cannot redirect the
commit to another index.

Tests: `scripts/worktree/utils/git.test.ts` — 4 cases. The load-bearing ones
seed `GIT_INDEX_FILE`/`GIT_DIR` at a foreign location and assert the *resolved
result* diverges: the inheriting child answers from the seeded location, the
isolated child from `repoRoot`. Both were verified to fail when the filter is
neutered (mutation-checked), so neither is self-skipping.

`bun test scripts/worktree/` green. Note these tests are outside `test:unit`
(scope is `src/` only) — see the coverage-gap note on the fork-retirement ticket.

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (`docs/giwt-scripts-map.md` try-8, AGENTS.md)


## Verification Notes (2026-10-01)

Re-verified against `dev` before closing. Commit `f28c3ca24` ("fix(worktree):
isolate git env, harden finalize/rebase targets") landed this on `dev`; only the
`Status:` line was stale.

- `gitSync` (`git.ts:158`) and `gitSyncQuiet` (`:172`) both spawn with
  `env: isolatedGitEnv()`. The filter strips five prefixes — `GIT_`, `OMP_`,
  `PI_`, `ENGRAM_`, `MNEMO_` — a superset of what the ticket asks for, covering
  the OMP/PI/ENGRAM/MNEMO "compounding factor" the ticket raised.
- Re-ran the mechanical spawn audit rather than trusting the Resolution's count:
  **42 git spawns found, 42 carry an isolated env, 0 without.** The Resolution
  says 40; `dev` has grown by two since, so the claim holds but its number is
  stale.
- `isolatedGitEnv(source = process.env)` takes an injectable source. That is
  load-bearing for parallel safety: a test seeding `process.env` directly would
  race every other test in the file.
- `bun test scripts/worktree/utils/git.test.ts` → 4 pass / 0 fail.
- Mutation check: replacing the prefix test with `if (false)` turns that into
  **1 pass / 3 fail**. The discriminating tests really do observe the resolved
  result diverging, so they are load-bearing.
## Resolution (2026-09-29)

`isolatedGitEnv()` added to `scripts/worktree/utils/git.ts` and wired into
`gitSync`/`gitSyncQuiet` plus every git-child spawn across the fork — audited
mechanically, not by eye: 40 git spawns carry an isolated env, 0 do not. That
covers `finalize`, `rebase`, `abort`, `merge`, `remove`, `cleanup`, `create`,
`new-branch`, `prs`, `commit`, and `commit-branch`.

Two spawn classes deliberately keep the inherited env: `gpg --list-secret-keys`
(gpg reads no `GIT_`/`OMP_` var) and the `gh`/`which` calls in `prs.ts`.

`commit.ts` and `commit-branch.ts` were the sharpest case: both forwarded
`...process.env` wholesale while setting `GIT_COMMITTER_NAME`/`_EMAIL`. They now
spread `isolatedGitEnv()` and re-set only the identity the command owns, so the
committer override survives while a hook's `GIT_INDEX_FILE` cannot redirect the
commit to another index.

Tests: `scripts/worktree/utils/git.test.ts` — 4 cases. The load-bearing ones
seed `GIT_INDEX_FILE`/`GIT_DIR` at a foreign location and assert the *resolved
result* diverges: the inheriting child answers from the seeded location, the
isolated child from `repoRoot`. Both were verified to fail when the filter is
neutered (mutation-checked), so neither is self-skipping.

`bun test scripts/worktree/` green. Note these tests are outside `test:unit`
(scope is `src/` only) — see the coverage-gap note on the fork-retirement ticket.

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (`docs/giwt-scripts-map.md` try-8, AGENTS.md)
