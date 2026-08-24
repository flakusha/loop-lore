# TASK: Fix worktree CLI REPO_ROOT/TREE_DIR env-var requirement when run from inside a worktree

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Tooling gap discovered during finalization of 6 concurrent worktrees.

Repro:
1. cd /home/flak/git-ai/loop-lore/tree/<worktree>
2. bun run scripts/worktree/ agent-commit <branch> 'msg'
   → 'worktree not found for branch <branch>'

Root cause:
scripts/worktree/utils/config.ts line 12-13 derives __dirname from import.meta.url. When bun resolves scripts/worktree/ via cwd-relative resolution from inside a worktree, the resulting import.meta.url points into <worktree>/scripts/worktree/utils/config.ts (which doesn't exist as a real file — it's cwd-resolved, not realpath-resolved). Then resolve(__dirname, '..', '..', '..') on line 50 returns /home/flak/git-ai (wrong).

Effect:
Every worktree-finalize script (agent-commit, finalize, merge, rebase, status, sign) fails with 'worktree not found for branch <branch>' when invoked from inside the worktree dir.

Current workaround (used during finalization campaign 2026-08-24):
REPO_ROOT=/home/flak/git-ai/loop-lore TREE_DIR=/home/flak/git-ai/loop-lore/tree bun run scripts/worktree/ <cmd> ...

Required:
- scripts/worktree/index.mjs (or utils/config.ts) should detect its own real on-disk location via realpath() of the symlink-resolved script path, then derive REPO_ROOT from there.
- After fix, 'cd <worktree> && bun run scripts/worktree/ finalize <branch>' must work without env vars.

Acceptance:
- cd <worktree> && bun run scripts/worktree/ agent-commit <branch> 'msg' commits successfully.
- cd <worktree> && bun run scripts/worktree/ finalize <branch> --force --merge-strategy direct merges correctly.
- cd <main-repo> && bun run scripts/worktree/ finalize <branch> still works (regression check).
- bun test src/routes/worktree/ green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
