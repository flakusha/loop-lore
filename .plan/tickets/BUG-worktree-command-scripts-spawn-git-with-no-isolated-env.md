<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: worktree command scripts spawn git with no isolated env

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:**

Worktree git helpers under `scripts/worktree/commands/*` spawn git directly with `Bun.spawnSync` instead of going through `gitSync`/`gitSyncQuiet`, so a hook-exported `GIT_DIR` / `GIT_INDEX_FILE` could redirect them. Highest severity was `finalize.ts` — routinely invoked from git hooks — where `merge --abort`, `reset --hard`, `stash push`/`pop` and `branch -d` acting on the wrong repository is data-destructive, not merely wrong-output.

giwt had already done this migration in its own tree; the fork was brought in line by `f8a2aba71`.

**Context:**

This ticket was salvaged from the abandoned `fix-open-bug-tickets` branch, where it was filed but never landed. The defect it describes was fixed on `dev` by `f8a2aba71`, so it is filed directly as Done rather than re-filed as open work.

**Acceptance Criteria:**

- [x] Every direct `Bun.spawnSync(["git", ...])` callsite under `scripts/worktree/` passes `env: isolatedGitEnv()`
- [x] A test seeds `GIT_DIR` and `GIT_INDEX_FILE` and asserts the child git resolves against the intended `repoRoot`
- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Verification Notes (2026-10-01)

Re-verified every callsite mechanically rather than trusting the branch's line
numbers, which have since drifted (`dev` has moved ~150 commits since):

- `finalize.ts` — all 18 direct git spawns carry an isolated env, including the
  four named as data-destructive: `merge --abort` (:351), `stash push` (:477),
  `stash pop` (:515), `reset --hard` (:530), and `branch -d`/`-D` (:1085, :1093).
- The other files the ticket enumerates are fully covered:
  `merge.ts` 3/3, `abort.ts` 2/2, `remove.ts` 3/3, `rebase.ts` 3/3, `commit.ts` 3/3,
  `commit-branch.ts` 3/3, `cleanup.ts` 1/1, `create.ts` 1/1, `new-branch.ts` 1/1,
  `prs.ts` 1/1, `git.ts` 2/2.
- Repo-wide sweep of `scripts/worktree/`: 41 git spawns, 41 isolated, 0 without.

The tests backing the `isolatedGitEnv` contract live in
`scripts/worktree/utils/git.test.ts` and are mutation-checked — neutering the
prefix filter turns 4 pass / 0 fail into 1 pass / 3 fail. See the sibling ticket
`BUG-worktree-git-helpers-pass-no-isolated-env-so-hook-context-le`.

Note: these tests sit outside `test:unit` (whose scope is `src/` only).
