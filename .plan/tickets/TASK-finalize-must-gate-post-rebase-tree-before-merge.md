<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Finalize must gate the post-rebase tree (check runs before merge)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

The finalize command (`scripts/worktree/commands/finalize.ts`) runs Step 2 (`bun run check`) in the worktree **BEFORE** Step 5 (rebase/merge), then fast-forwards dev onto the worktree branch with **no gate on the post-rebase tree**. The tree actually merged may differ from the tree that was checked (the rebase pulls in concurrent dev merges that landed after the check).

Proven in bug-batch-2026-09-05 (reflog-verified chronology):
- `365cb210` (character-growth, crud.ts@399L + actor-growth.ts) merged to dev at 02:02.
- `d286db9b` (my batch) fast-forward merged at 11:39:24 — its tree contained crud.ts@399L and actor-growth.ts (both `f422a8eb`), and `size - strict` was live in `check-parallel.mjs` (line 95, iterated unconditionally).
- A genuine `bun run check` on that tree **cannot pass** (size-strict → exit 1). Finalize exited 0 anyway.
- Post-merge dev check (gitHead `48941fd8`) failed 3 gates: eslint (`actor-growth.ts` Promise.all, growth-service bridges), size-strict (`crud.ts` 399L, `character-growth/index.ts` 257L), md:lint (`epic-character-growth.md` MD004).

Two mechanisms are consistent (both mean the merged tree was never gated): (a) finalize invoked with `--force` (Step 2 `if (force) log("warn", "Skipped: --force flag set")`), or (b) Step 2's check ran and passed on an earlier/different tree state than what Step 5 merged. Neither is directly provable from surviving artifacts (worktree report pruned); both are covered by gating the post-rebase tree.

**Fix:** re-run `bun run check` (and `test:unit`) on the worktree **after** the rebase, immediately before the merge — or require the checked tree's gitHead to equal the commit being merged. Refuse to merge when the post-rebase tree is unverified. Do NOT merely compare a stale report's gitHead (a pre-rebase tree's report matches its own HEAD vacuously); the change is that Step 5's rebase invalidates the Step 2 result.

## Acceptance Criteria

- [ ] Finalize re-runs `bun run check` + `test:unit` after the rebase/merge step
- [ ] Finalize refuses to merge when the post-rebase tree is unverified (or --force explicitly documented as the only bypass)
- [ ] Regression: a worktree whose tree contains a known `size - strict` failure cannot finalize with exit 0
- [ ] Existing green worktrees still finalize normally (no false rejections)
- [ ] Documentation updated (AGENTS.md finalize section)

## Related

- `scripts/worktree/commands/finalize.ts` — Step 2 check before Step 5 rebase/merge
- `scripts/check-parallel.mjs` — size-strict live in runner
- Post-merge failures on dev `48941fd8`: eslint, size-strict, md:lint (character-growth files)