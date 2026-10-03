<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: diff-scoped gates diff against a stale merge-base so scope explodes to the whole repo

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**


`giwt finalize` DOES pass `--diff-base` (`node_modules/giwt/src/commands/finalize/gates.ts:36-37` resolves it, `checks.ts:39-43` appends it to the check command; opt-out `[commands] diff_base = false` is not set in `giwt.toml`). The coverage gate is NOT repo-wide. The `"mode":"diff-files"` key is real — emitted by `scripts/check/coverage.mjs:380-387`, the `--files=` path.

The real defect is in `scripts/check-parallel.mjs:141-158` (`changedFiles()`): it computes `git merge-base <base> HEAD` and diffs against it. When the worktree branch has not been rebased onto `dev`, that merge-base is arbitrarily old, so the "branch diff" degenerates to most of the repository.

Measured on `feat-actor-autonomy-dispatch` (2026-10-02):

- merge-base(`dev`, HEAD) = `38d95ac01` (2026-09-29) — 3.5 days / 268 dev-commits stale
- `git diff --name-only dev...HEAD` = **1798 files** (237 branch commits)
- true scope (branch content still differing from the dev tip) = `git diff --name-only dev HEAD` = **244 files**, of which **109** are non-test `src/**.ts`
- scoped coverage gate result: `{"mode":"diff-files","floor":80,"total":1295,"fail":55}`

`total` is 1295 — every non-test `src/**.ts` file in the repo — instead of the 109 that actually differ from the dev tip. (Verified: filtering the merge-base diff for `src/**/*.ts` minus `*.test.ts` yields exactly 1295, matching the gate's `total`; the same filter on the true scope yields 109.)

**53 of the 55 coverage failures are artifacts of the stale diff-base**, not branch debt. Cross-referencing the 55 failing files against the true 244-file scope (`git diff --name-only dev HEAD`) leaves exactly **2** real failures: `src/routes/admin/world-events.ts`, `src/rpg/world-travel/budget.ts`. The same two survive the looser `comm -23` branch-only approximation, so the attribution does not depend on which scope measure is used. The other 53 (`src/transport/compression.ts` 76.7%, `src/middleware/auth/authenticate.ts` 36.1%, `src/services/server-external-manager/start-llama.ts` 4.8%, …) are byte-identical to the dev tip — they enter scope only because the merge-base is 268 commits behind, and the per-file floor then measures pre-existing debt.

`feat-story-mode-ui` shows the same shape — verified directly: merge-base `38d95ac01`, 219 commits ahead of it, 1728 files in `dev...HEAD`. Its `total:1256, fail:54` coverage line is quoted from the earlier `giwt finalize` run and was NOT re-run for this ticket, so treat those two numbers as reported-not-reproduced; the divergence figures beside them are reproduced.

**Context:**

Reproduction (read-only):

```
cd ~/git-ai/loop-lore/tree/feat-actor-autonomy-dispatch
bun run scripts/check-parallel.mjs --diff-base dev --gates "coverage - per-module line %"
# → {"mode":"diff-files","floor":80,"total":1295,"fail":55}
git rev-list --count $(git merge-base dev HEAD)..HEAD      # 237
git diff --name-only dev...HEAD | wc -l                    # 1798
# true scope = branch content that still differs from the dev tip:
git diff --name-only dev HEAD | wc -l                       # 244
# non-test src/*.ts in each scope (this is what SCOPED_DIFF_SRC_FILES counts):
git diff --name-only $(git merge-base dev HEAD) HEAD | grep '^src/' | grep '\.ts$' | grep -vc '\.test\.ts$'   # 1295
git diff --name-only dev HEAD | grep '^src/' | grep '\.ts$' | grep -vc '\.test\.ts$'                              # 109
```

Caveats and negative space:

- `changedFiles()` runs `git diff --name-only <mergeBase>` with no second ref, i.e. merge-base vs the **working tree**, then unions `git diff --name-only HEAD`. All numbers above were taken on a clean worktree (`git status --porcelain` empty), where the two are equivalent; an operator with uncommitted churn gets a scope inflated on top of the staleness bug.
- The scope is merge-base-based by construction, so it can never be smaller than the branch's true divergence. Even a perfectly rebased branch still floors every file it genuinely changed.
- `AGENTS.md:37-40` is accurate that `giwt finalize` passes `--diff-base`, but says coverage is "floored only for modules the diff touches". Since BUG-37a3763 the gate floors each diff-touched **file** individually (`check-parallel.mjs:495-505` passes `--files=`, `coverage.mjs:343-388`), which is why a single comment-only touch of a low-coverage file fails the gate. Doc and behaviour have drifted; worth correcting while fixing this.

The `plan - validate` / `plan - ticket index (sync)` gates are NOT affected: `scripts/check-parallel.mjs:311-318` defines them as plain project-wide commands with no diff scoping, by design (see the mode comment at `:99-100`). Their failures on pre-existing `.plan` drift are a separate cause.

Fix directions (pick one):

1. Use the target branch tip, not the merge-base, when the branch is behind: `git diff --name-only dev...HEAD` already does merge-base; the cheaper guard is to warn/fail fast when the merge-base is more than N commits behind the target, telling the operator to rebase first.
2. Have `giwt finalize` (or `runCheck`) pass the target branch name directly and let `changedFiles` decide, so the runner can fall back to `dev..HEAD` semantics once the branch is rebased.
3. Make staleness visible: emit the resolved diff-base age and scope size in the run report so a 1295-file "scoped" run is self-evidently wrong.

**Acceptance Criteria:**

- [ ] Scoped coverage `total` on `feat-actor-autonomy-dispatch` drops from 1295 to 109 once the branch is rebased onto dev, or the gate refuses to run and names the stale diff-base
- [ ] Failing set reduced to the 2 real branch files (`world-events.ts`, `world-travel/budget.ts`) or waived with a reason
- [ ] Regression test asserting scope size for a deliberately stale merge-base
- [ ] Documentation updated
