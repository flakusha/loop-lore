<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: giwt sync --fix mutates repo-wide refs/issues/* shared across all worktrees with no worktree scoping

**Status:** Not Started
**Priority:** critical
**Effort:** Medium
**Tags:** giwt, tooling, worktree-isolation

**Summary:**

## Observed

`giwt sync --fix` closes git issues by writing to `refs/issues/<uuid>`, a REPO-WIDE ref. This repo currently has 17 worktrees. A fix run in ONE worktree silently changes issue state as observed from ALL the others, including agents running unrelated branches concurrently.

## Concrete instance

Running `giwt sync --fix` inside worktree tree/chore-salvage-sweep-tickets mutated:

    refs/issues/df4c473c-4671-49e1-a3de-e06c7710e0b7
    before: 5d91721b  State: open
    after:  16e9d842  State: closed
             "Auto-closed: ticket TASK-TMP-JANITOR-AND-STALENESS-MARKERS marked done in index.json"

That worktree's actual diff was 5 rescued .plan/tickets/*.md files plus regenerated index.json, code-map.json and feature-matrix.md. Touching an unrelated ticket's issue registry entry is well outside that diff's declared scope, and it is not visible in `git status` of any worktree.

## Mechanism

Two `execSync` call sites write issue state:

- sync-index.ts:488 — `git issue state <hash> --close` (indexStatusStale pass)
- sync-index.ts:876 — `git issue state <hash> --close` (staleOpenGitIssues pass)

Both pass `cwd: repoRoot`. Note that this parameter is MISLEADINGLY NAMED: `runSync(repoRoot, opts)` at sync-index.ts:224 receives the WORKTREE root, not the repository root. Callers pass `opts.worktreeRoot` through — see validate.ts:500 and validate.ts:708/717, wired at plan.ts:464-465 and finalize.ts:1350-1355. So `cwd` is the worktree directory.

The sharing is NOT caused by `cwd`. It is inherent to git worktrees: `refs/*` live in the shared common directory, not per-worktree. Verified on this repo:

    $ git -C tree/chore-salvage-sweep-tickets rev-parse --git-common-dir
    /home/flak/git-ai/loop-lore/.git

The mutated ref resolves to the identical commit from three different working directories (dev checkout, the salvage worktree, and the ticket worktree):

    16e9d842f6e926ecdf36a46ad3eac64f7e3bab65

So the blast radius is unavoidable for any command that writes a ref from inside a worktree. The defect is that `sync --fix` performs such a write as a side effect of a plan-file reconciliation, with no scoping to the worktree's own diff and no record of the write.

## Why this is a SEPARATE ticket from the non-convergence bug

Different failure mode, different blast radius, different fix:

- The non-convergence bug is a logic/ordering defect: wrong exit code, extra work, no cross-branch damage.
- This is a scope/isolation defect: a worktree-scoped command mutating shared state outside its diff. Even with perfect convergence, a single-pass `sync --fix` in any worktree would still silently close issues repo-wide.

The instance above was the SECOND pass of a two-pass run (see the companion ticket). Even so, the mutation happened in a worktree whose committed change had nothing to do with that ticket.

## Impact

- Concurrent agents in other worktrees observe issue-state changes they did not make and cannot see in their diffs.
- A ticket being closed in one branch's worktree silently flips the same ticket's state for every other branch and worktree.
- No record in the acting worktree's commit explains the mutation, so `git log` does not explain the state change.
- Blast radius scales with worktree count, which is actively growing on this host.

## Suggested fix

Options, roughly in order of preference:

1. Dry-run by default for issue-state mutations, with an explicit opt-in flag, so `sync --fix` in an agent worktree cannot silently rewrite shared refs.
2. Make the close operation idempotent AND require that the issue being closed is reachable from the worktree's own diff (i.e. only close issues for tickets whose .md or index entry the worktree actually touched).
3. At minimum, emit a loud ledger record and a finalize-time report line naming every `refs/issues/*` ref written, so the mutation is attributable after the fact.

Whatever is chosen, the acting worktree should leave a durable trace of shared-ref writes.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
