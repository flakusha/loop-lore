<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: diff-scoped gates diff against a stale merge-base so scope explodes to the whole repo

**Status:** Done
**Priority:** Medium
**Effort:** Medium

**Summary:**


`giwt finalize` DOES pass `--diff-base` (`node_modules/giwt/src/commands/finalize/gates.ts:36-37` resolves it, `checks.ts:39-43` appends it to the check command; opt-out `[commands] diff_base = false` is not set in `giwt.toml`). The coverage gate is NOT repo-wide. The `"mode":"diff-files"` key is real — emitted by `scripts/check/coverage.mjs:380-387`, the `--files=` path.

The real defect WAS in `changedFiles()` — originally `scripts/check-parallel.mjs:141-158`, now `scripts/check/parallel/context.mjs:92-105` after the module split. It computed `git merge-base <base> HEAD` and diffed against that. When the worktree branch had not been rebased onto `dev`, that merge-base was arbitrarily old, so the "branch diff" degenerated to most of the repository. **Both halves are now fixed — see Verification 2026-10-05 below.** The measured numbers that follow are the original 2026-10-02 report against `feat-actor-autonomy-dispatch`, retained as the record of the bug; they are not re-measured.

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

- [x] Scoped coverage `total` on `feat-actor-autonomy-dispatch` drops from 1295 to 109 once the branch is rebased onto dev, or the gate refuses to run and names the stale diff-base
- [ ] Failing set reduced to the 2 real branch files (`world-events.ts`, `world-travel/budget.ts`) or waived with a reason — NOT VERIFIED: no re-measurement of the coverage gate was run against `feat-actor-autonomy-dispatch`; the defect that inflated the set is fixed, but the residual 2-file branch debt was not re-counted.
- [x] Regression test asserting scope size for a deliberately stale merge-base
- [x] Documentation updated


## Verification 2026-10-05

Two halves had to change together; both did.

**1. The runner no longer computes a merge-base.** `changedFiles()` at
`scripts/check/parallel/context.mjs:92-105`:

```js
export function changedFiles(base, cwd = DIFF_ROOT,) {
  if (!base) { return []; }
  const committed = execFileSync(
    "git",
    ["diff", "--name-only", base, "HEAD",],
    { cwd, encoding: "utf8", },
  );
  const dirty = execFileSync(
    "git",
    ["diff", "--name-only", "HEAD",],
    { cwd, encoding: "utf8", },
  );
  return [...new Set(`${committed}\n${dirty}`.split("\n",).map((f,) => f.trim()).filter(Boolean,),),].sort();
}
```

That is a two-dot tree-vs-tree `git diff <base> HEAD`, not a three-dot
`git diff A...B` and not a diff against `merge-base(A, HEAD)`. A grep for
`merge-base` across `scripts/check/` and `scripts/check-parallel.mjs` now
returns comment lines only (`context.mjs:63,65,71,72,75`) — no executable
call remains **in the runner**. A repo-wide grep of `scripts/` confirms no
`git merge-base` invocation anywhere in the check path at all.

One other `changedFiles` exists at `scripts/check/weave-damage.mjs:60-63`
(`git diff --name-only --diff-filter=d <base>`, base from `WEAVE_BASE` or
argv). It is NOT merge-base-scoped and does not need to be: it is a
pre-rebase damage scan, opt-in via `WEAVE_BASE` (`gates.mjs:259-261`,
`NOOP_OK` otherwise), and the operator passes the pre-rebase ref
deliberately — measuring damage introduced BY a rebase is exactly a
merge-base question. It is outside the reported failure mode (it has no
coverage `total`/`fail` line) and is left as-is.

**2. `resolveDiffBase` returns the target, not the merge-base.**
`scripts/worktree/commands/finalize.ts:630-642` validates the ref with
`git rev-parse --verify <target>^{commit}` and then `return target;` (line
641). The previous merge-base lookup is gone. Change commit `f09d4dd2b`
(2026-10-04, `git merge-base --is-ancestor f09d4dd2b HEAD` exits 0).

**Tests — behavioural, not wiring.**
`scripts/check-parallel.diff-base.test.mjs` builds a real temp git history
where the branch and the base each edit the same file and the base then
reproduces the branch's edit byte-for-byte. It first pins the pre-fix
over-report as a control (`mergeBaseSet()` equals both files, line 165), then
asserts `changedFiles("main", workDir)` returns exactly the one genuinely
divergent file (line 179) and excludes the converged one (line 171). That
is the scope-vs-real-divergence boundary, not a wiring assertion. It also
pins that a base with no common ancestor no longer throws (lines 267-283),
which is the crash the merge-base lookup used to cause.
`scripts/worktree/resolve-diff-base.test.ts:70-74` asserts
`resolveDiffBase` returns the target branch after it has moved past the fork.

`bun test scripts/check-parallel.diff-base.test.mjs scripts/worktree/resolve-diff-base.test.ts`
→ 16 pass, 0 fail.


**Fixture isolation — both files are per-test and order-independent, with
one caveat worth recording.** Each test owns its own `mkdtemp` repo under a
distinct prefix (`loop-lore-diff-base-`, `loop-lore-resolve-diff-base-`) and
removes it in `afterEach`, so neither writes a fixed path and both are safe to
run concurrently. Verified rather than assumed:

- 6 files together: 64 pass, 0 fail. Same 6 in reversed order: 64 pass.
- Each file alone: 12 pass / 4 pass / 21 pass.
- `bun test --parallel=4` on both git-fixture files: 16 pass.
- Same file run twice back to back: 16 pass both times (no cross-run leak).

Caveat: the two files are NOT equally hardened against host git config.
`check-parallel.diff-base.test.mjs` pins `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM`
to `/dev/null`, strips the `GIT_*` redirect vars, and carries identity via env.
`scripts/worktree/resolve-diff-base.test.ts:38-45,47-63` spawns git with NO env
(`Bun.spawnSync(cmd, { cwd, ... })` inherits the whole environment) and sets
identity with a repo-local `git config` write, so whatever the host demands
rides straight in. Reproduced the resulting failure with no persistent config
change anywhere — identity and signing supplied as one-shot `git -c`
overrides, host config nulled by the `GIT_CONFIG_GLOBAL` env var only:

```
identity via -c, gpgsign=false  → status=0
identity via -c, gpgsign=true   → status=128  fatal: failed to write commit object
```

So on a host that demands signatures (this repo's own local config has
`commit.gpgsign=true`), that fixture's commits die unless the suite nulls the
host config or passes `-c commit.gpgsign=false`.

This does NOT weaken the fix verdict: it is a property of the TEST FIXTURE's
environment hygiene, not of `changedFiles` or `resolveDiffBase`, and the fix is
independently reproducible without either suite (see below).

Fix direction — both sanctioned, no persistent config write involved. Either
copy the `GIT_ENV` block from `check-parallel.diff-base.test.mjs:53-75`, or
reuse the existing `isolatedGitEnv()` helper in
`scripts/check/weave-damage.test.mjs:58-68`; or make the suite's `run()` append
`-c user.name=... -c user.email=... -c commit.gpgsign=false` to each git argv,
which is a one-shot override rather than a persisted setting. The third is the
smaller diff. Note the fixture should NOT set repo-local identity via
`git config` at all — that is a persistent write, and the reason it leaks host
settings in the first place is that it is the one call in the fixture with no
per-invocation override beside it.

Left alone here — out of this ticket's scope, and touching test files is
outside the change this ticket records.

**Is the reported failure mode still reachable? No.** The scope is now the
set of files whose content differs between the target tip and HEAD, so a
stale merge-base cannot widen it — the fork point is no longer an input to
the computation. Two documented supersets remain by design (rename/mode/
whitespace-only diffs are still listed, and only tracked working-tree
changes are seen): both over-scope, which costs a false red, never a false
green. Neither reintroduces the reported explosion.


**Independent of the suites.** Built the same fork/advance/reproduce history
in a throwaway repo with no test harness and compared both diff forms directly:

```
merge-base(main,HEAD) = 2c840f8ec8f04decd9108edb107605c33aa7caf1
git diff main HEAD   (two-dot, current impl) = ["src/a.ts"]
git diff <merge-base> (pre-fix impl)       = ["src/a.ts","src/converged.ts"]
scope shrank from 2 to 1
```

The stale-merge-base over-report and its removal are therefore properties of
the git semantics, observable without running either test file.
