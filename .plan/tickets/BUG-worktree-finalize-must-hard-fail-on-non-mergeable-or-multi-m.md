<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: worktree finalize must hard-fail on non-mergeable or multi-merge dev state, never blind stash round-trip

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-tooling-improvement

## Summary

HARD FAILURE REQUIRED at precheck (before any merge) when the dev checkout holds unmerged paths (diff-filter=U non-empty), staged-but-uncommitted content, or an active finalize lock — exit non-zero with diagnostic (file list + stash list), touch NOTHING. Today (2026-09-02) three concurrent finalize runs on the shared dev checkout: stash-push of a 1751-file staged-revert pile succeeded where it must abort, FF merges raced weave stash-restore, and a restore failure left the dev checkout with 6 unmerged paths + 1751 stale staged entries (weave: 3 entities auto-resolved conflict confidence; resolveUserIdFromSession ours-modified vs theirs-deleted; stash@{0..2} worktree-finalize-mtk5xyo5/mtk5oeq0/mtk4uvkw stacking). Postconditions to enforce: (a) single-flight finalize lock at dev root (concurrent runs queue or fail fast, never interleave); (b) stash push --include-untracked only when dev is mergeable; if stash already exists from a crashed run, require resolution first — never silently layer; (c) restore failure must leave tree EXACTLY at stash-base, stash entry kept intact, manual-recovery hint printed (current code prints recovery hint but the tree can be left half-applied); (d) size-strict --force must still fail hard on (a)-(c) classes; force skips gates, not invariants.

## Evidence (2026-09-02 session logs)

- Three `worktree finalize` processes ran concurrently against the shared dev checkout
  (`finalize epic-rag-assets` ×3 observed via `ps`); each stashes/restores the dev tree
  around its FF merge with no cross-process coordination.
- One crashed restore left the dev checkout holding a 1751-file staged-revert pile plus
  6 unmerged paths (`epics-index.md`, `README.md`, `open-inflight.md`, `priority-p3-p5.md`,
  one ticket, `src/middleware/auth/token.ts`); a subsequent finalize then **successfully
  stash-pushed that corrupt state**, merged, and failed restore with
  `weave: ... auto-resolved (conflict confidence)` — partially applying stale reverts
  (e.g. `resolveUserIdFromSession` "modified in ours, deleted in theirs").
- Three stacked `worktree-finalize-<id>` stashes accumulated silently; nothing surfaced
  their existence or blocked on them. Recovery required human-approved
  `git reset && git restore -- .` at dev root.

## Affected code

- `scripts/worktree/commands/finalize.ts` — `stashStaleDevTree()` (~L83),
  `restoreStashedDevTree()` (~L110), step 5b FF-merge flow; precheck step 1 only
  validates the **branch worktree**, never the dev checkout state.

## Required behavior

1. **Hard-fail precheck** (before any mutation, every path incl. `--force`):
   dev checkout mergeable = no unmerged index entries
   (`git diff --name-only --diff-filter=U` empty), no staged-uncommitted content, and
   no pre-existing `worktree-finalize-*` stash. Violation → exit non-zero printing the
   offending file list, stash list, and per-file `git log` hint — tree untouched.
2. **Single-flight lock** at dev root (e.g. `.git/worktree-finalize.lock` with pid +
   age-based stale takeover) so concurrent finalizes queue or fail fast; never interleave
   stash/merge/restore.
3. **Transactional restore**: on any restore conflict, unwind the worktree exactly to the
   post-merge HEAD, keep the stash entry intact, print manual-recovery commands.
   Weave `conflict confidence` auto-resolution must never write stale deletions into a
   mergeable tree.
4. `--force` skips check/test **gates only**; invariants 1–3 are never skipped.

## Acceptance Criteria

- [ ] Finalize against a dev checkout with unmerged paths exits non-zero before touching
      anything; unmerged file list + stash list in the error output.
- [ ] Finalize refuses to proceed when a `worktree-finalize-*` stash already exists
      (resolution hint printed).
- [ ] Two simultaneous `finalize` invocations cannot interleave: second one blocks or
      fails fast (lock test with two spawned processes).
- [ ] Simulated restore conflict leaves dev exactly at post-merge HEAD, stash preserved
      (integration-style test with a scripted dirty tree).
- [ ] `--force` still enforces all of the above (test pins invariant-over-gate semantics).
- [ ] AGENTS.md "Stop on tooling failure" section gains one line: finalize aborts on
      non-mergeable dev checkout by design.
