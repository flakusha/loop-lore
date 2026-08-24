# TASK: Fix worktree CLI REPO_ROOT/TREE_DIR env-var requirement when run from inside a worktree

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

Tooling gap discovered during finalization of concurrent worktrees.

Repro (before fix):
1. cd /home/flak/git-ai/loop-lore/tree/<worktree>
2. bun run scripts/worktree/ agent-commit <branch> 'msg'
   → 'worktree not found for branch <branch>'

Root cause:
scripts/worktree/utils/config.ts derived __dirname from import.meta.url. When
bun resolved scripts/worktree/ via cwd-relative resolution from inside a
worktree, import.meta.url pointed into <worktree>/scripts/worktree/utils/config.ts
(a real path bun creates), and `resolve(__dirname, "..", "..", "..")` on that
returned <worktree> instead of the main repo.

Effect (before fix):
Every worktree-finalize / commit / status / ticket command that did not
assertNotInWorktree() (agent-commit, agent-merge, status, branches, comment,
issues, prs, search, show, ticket, etc.) failed with 'worktree not found
for branch <branch>' when invoked from inside the worktree dir. Commands that
did assert (cleanup, create, finalize, merge, new, rebase, remove) refused
to run from inside the worktree.

## Fix (2026-08-24)

- Added `scripts/worktree/utils/git.ts:findRepoRoot(startDir?)` — uses
  `git rev-parse --git-common-dir` from cwd to locate the shared `.git`
  (always lives at the main repo root) and returns its parent. Works from
  main repo, from any linked worktree, and from arbitrary subdirs.
- Refactored `isInsideWorktree` to use `findRepoRoot` (DRY).
- `scripts/worktree/utils/config.ts:loadConfig()` now uses `findRepoRoot()`
  instead of `resolve(__dirname, "..", "..", "..")`. REPO_ROOT / TREE_DIR
  env vars remain as opt-in escape hatches for CI / non-standard layouts.
- `scripts/worktree/commands/finalize.ts` — removed `assertNotInWorktree()`
  so finalize can be run from inside the worktree being finalized (the
  explicit branch arg identifies the target).

Verified (worktree `tree/fix-worktree-cli-repo-root-detect`):
- `cd <worktree> && bun run scripts/worktree/ agent-commit <branch> 'msg'`
  works without env vars (exits cleanly with "no staged changes" instead
  of "worktree not found").
- `cd <worktree> && bun run scripts/worktree/ finalize <branch> --force
  --merge-strategy direct` runs through to merge step (skips checks via
  --force) without "must be run from the repo root" or "worktree not
  found" errors.
- `cd <main-repo> && bun run scripts/worktree/ finalize <branch>` still
  works (regression check via existing 47-test suite).
- 5 new integration tests added in `tests/worktree-flow.test.ts`:
  - 48. issues — runs without REPO_ROOT env var
  - 49. status — works from inside a linked worktree without env vars
  - 50. REPO_ROOT env var still works as escape hatch
  - 51. REPO_ROOT pointing at a different repo errors clearly
  - 52. findRepoRoot — resolves to main repo from worktree cwd
- All 5 new tests pass; baseline 47-test suite unchanged (same 16 pre-existing
  `master`-vs-`dev` setup failures, no regressions).
- typecheck-backend, typecheck-frontend, typecheck-coverage, typecheck-coverage-frontend,
  lint-ts (eslint), lint-oxlint all pass.
- dprint formatted my changed files; pre-existing `messages/create.ts`
  formatting drift on dev HEAD is unrelated.

Merged to dev: commit `a80cf182` (chore(merge) wrapping fix commit
`c25bda76`).

## Acceptance Criteria

- [x] Implementation complete (`findRepoRoot` + `loadConfig` + finalize assertion removed)
- [x] Tests passing (5 new tests added, all pass; baseline 47 unchanged)
- [x] Documentation updated (this ticket)
