<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Delete the in-repo scripts/worktree fork; giwt is the only worktree CLI

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

loop-lore ships its own duplicate of the giwt worktree CLI at
`scripts/worktree/` (1095-line `finalize.ts` against giwt's 1646). Every
worktree operation already goes through `giwt`; the fork survives only because
three of its fixes were never upstreamed. Those have since landed, so it is no
longer ahead and there is no reason to keep it.

**Context:**

Retirement was blocked by parity. A giwt-repo ticket titled
"reach parity with the loop-lore worktree fork so it can be deleted" recorded
three deltas where the FORK was ahead, and deleting first would have regressed
loop-lore. Re-verified 2026-10-02 — all three landed in giwt:

1. **Detached-root finalize guard** — `giwt/src/commands/finalize.ts:1215-1234`
   refuses a detached main checkout instead of falling back to a literal
   `getRootBranch()`.
2. **git child env isolation** — measured mechanically per call site, not by
   eye: giwt 50/50 `git` spawns isolated, fork 39/39. `commit`/`commit-wt`
   spread the filtered env and re-set only `GIT_COMMITTER_*`
   (`commit.ts:99`, `commit-wt.ts:118`).
3. **Rebase default target** — `giwt/src/commands/rebase.ts:25` reads
   `config.settings.branches.root`.

giwt is additionally ahead on features the fork lacks: Step 5.5 scoped-worktree
plan reconciliation, the FIFO finalize lock queue, `--jobs`, and
`--gates`/`--skip-gates`/`--plan-gates`.

**What actually blocks deletion**

Not parity — live imports. Three non-fork files import from
`scripts/worktree/`, so removing the directory as-is breaks them:

- `scripts/lib/colors.ts` → `../worktree/utils/colors`
- `scripts/lib/assertions.ts` → `../worktree/utils/colors`
- `scripts/gpg-unlock.mjs` → `./worktree/utils/credentials.mjs`

The giwt equivalents are NOT drop-in. Measured: `colors` 93 vs 49 lines,
`credentials` 90 vs 134, `gpg` 172 vs 165, all three materially diverged.
So deletion means re-pointing those imports first (preserve the needed helpers
under `scripts/lib/`, or import from the pinned `node_modules/giwt`) — not just
removing files.

`tests/worktree-flow.test.ts` (618 lines) drives the fork through
`scripts/worktree/index.mjs` and must be removed or repointed in the same
change. Its test 33 ("finalize — no commits beyond base") encodes the
teardown-leak contract and should die with the fork rather than be ported.

**Docs corrected in the same pass**

`AGENTS.md`, `docs/meta/workflow.md`, and `docs/giwt-scripts-map.md` all
described the fork as a "full implementation" / "full duplicate". That parity
claim is false and is corrected: it is a retired duplicate, blocked only on the
import re-pointing above. The `giwt-scripts-map.md` "Still open" section also
claimed the fork carried commands upstream lacked (a missing `doctor`, a more
capable in-repo `report`) — that is backwards; `doctor` exists only in giwt and
`report` is registered in giwt's CLI at `cli.ts:275`.

**Acceptance Criteria:**

- [ ] `scripts/lib/colors.ts` and `scripts/lib/assertions.ts` no longer import
      from `scripts/worktree/`; color helpers preserved under `scripts/lib/`
      or sourced from the pinned giwt
- [ ] `scripts/gpg-unlock.mjs` no longer imports
      `worktree/utils/credentials.mjs`
- [ ] `tests/worktree-flow.test.ts` removed or repointed at `giwt`
- [ ] `scripts/worktree/` deleted in full (commands + utils + dispatcher)
- [ ] `bun run check` green: knip finds no dangling references, no gate reads
      the fork, `bun test` passes
- [ ] No remaining `scripts/worktree` reference outside historical
      `docs/plan-gen/` records and `docs/meta/code-practices-improvements/`
      session write-ups, which are history and stay
