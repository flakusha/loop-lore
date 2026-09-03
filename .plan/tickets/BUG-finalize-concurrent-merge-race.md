<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: finalize concurrent-merge race corrupts dev checkout

**Status:** ⬜ Not Started
**Priority:** High
**Epic:** epic-tooling.md

## Summary

**What**

Two concurrent `bun run scripts/worktree/ finalize <branch>` invocations race on the dev checkout's working tree:

1. A `git stash push` (saving dirty files)
2. `git merge --ff-only` / `git merge --squash` / `git merge --no-edit`
3. `git stash pop` (restoring dirty files)

Without coordination, A and B both push stashes, both mutate dev's working tree, and whichever finishes second pops the *other's* stash onto a tree that may already be in rebasing/merge/conflict state. Files end up in "modified" instead of the in-progress operation cancelling cleanly. The user reports "the stashing/remerging will drop a lot of files to 'modified' state instead of just cancelling the merge for the root branch in `rebasing`, `merge`, `conflict`, etc state".

**Why**

`stashDirtyDev()` → `restoreDirtyDev()` (now `stashDevForMerge` → `restoreDevFromStash`) wrap git operations on the shared `repoRoot`. The window between stash push and stash pop is unprotected. Two parallel invocations interleave: A pushes, B pushes, A merges, B merges, A pops (correctly), B pops (gets A's stale stash on top of B's merge state → "files in modified state").

**Where**

- `scripts/worktree/commands/finalize.ts:stashDirtyDev()` (renamed `stashDevForMerge`)
- `scripts/worktree/commands/finalize.ts:restoreDirtyDev()` (renamed `restoreDevFromStash`)

**How to fix**

1. Precheck (`checkDevMergeable`): refuse to start if dev has unmerged paths, staged entries, or in-progress sentinels (`MERGE_HEAD` / `REBASE_HEAD` / `CHERRY_PICK_HEAD`).
2. Single-flight lock (`acquireFinalizeLock`): atomic `O_CREAT|O_EXCL` lockfile at `${repoRoot}/.worktree-finalize.lock` (PID-encoded). PID-based stale-lock reaping via `kill -0`.
3. Transactional restore (`restoreDevFromStash` with `mergeHead` arg): if `git stash pop` conflicts with the post-merge tree, reset dev to the captured `mergeHead` (post-merge) so the checkout is clean and the stash entry is preserved for manual recovery.

All three are implemented in this branch.

## Acceptance Criteria

- [x] Precheck refuses dev-in-progress state
- [x] Single-flight lock prevents concurrent finalizes
- [x] Transactional restore on stash-pop conflict preserves work
- [ ] `bun run check` passes (no regressions)
- [ ] `bun run schemas:check` passes (no regressions)