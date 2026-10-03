<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Async spill namespace has no automated guard against a weave-driven rebase dropping it

**Status:** Not Started
**Priority:** medium
**Effort:** Small

**Summary:** `src/async/spill.ts` gained its per-process namespace (per `BUG-async-spill-offload-dir-is-a-fixed-cwd-relative-path-shared-` and `BUG-test-async-store-offload-dir-fixed-path-race`) on `dev` only. `feat-chat-finishers` does not contain that work and cannot revert it, but a weave-driven rebase of that branch — which `giwt rebase` performs routinely, and which the repo ledger records as in-flight — auto-resolves `src/async/spill.ts` and can silently DROP code. The `weave - damage scan` gate catches the duplication half only, and its own docstring states the drop half has no cheap mechanical signal. So this failure mode is currently caught by nothing.

**Context:** An audit reported that `feat-chat-finishers` reverted `src/async/spill.ts` to a flat shared `OFFLOAD_DIR` (net diff roughly −120/+20). That report does not hold. `git diff 117d6d79c feat-chat-finishers -- src/async/spill.ts` is empty, and the branch-side blob is byte-identical to the merge-base blob: the branch has **zero** commits touching `src/async/spill.ts`, `src/async/offload.ts`, `src/async/spill-retention.ts`, `src/async/index.ts`, `src/async/spill.test.ts`, or `src/async/spill-filename.test.ts`. The four namespace commits (`d6ec3e244`, `4e56f0674`, `70a151cd5`, `79f2ecc21`) are all on `dev` and none is reachable from the branch. A merge, rebase, or finalize therefore carries them onto the branch with no conflict to resolve and no opportunity to drop them. The reported −120/+20 is the `dev`-vs-branch diff, which measures dev-side work absent from an old base — not a revert authored by the branch.

The underlying hazard is still real, just narrower than reported: `giwt rebase` resolves conflicts with the weave, which can drop a block while leaving the file syntactically valid, so typecheck, lint, and dprint stay green and only the unit suite notices. `scripts/check/weave-damage.mjs:15-17` documents this exact gap. The guard needed is not a re-verification of a specific branch; it is a check that fires whenever the namespace symbols go missing, in any ref, by any cause.

**Acceptance Criteria:**
- [ ] A check fails when `src/async/spill.ts` no longer exports `SPILL_ROOT`, `offloadDir`, `spillRootDir`, `setOffloadDir`, or `resetOffloadDir`, or when `offloadDir()` stops defaulting to a `SPILL_ROOT/<pid>` namespace. The existing assertions in `src/async/offload.test.ts:44-66` cover the behaviour but only when the unit suite runs; a static gate catches it earlier and also catches the case where the test file is dropped in the same conflict.
- [ ] `offload.test.ts:52-53` remains the load-bearing assertion (`path.dirname(offloadDir()) === SPILL_ROOT` and `path.basename(offloadDir()) === String(process.pid)`). It is deliberately structural rather than a re-derived constant, because the pre-fix flat shape fails it. Do not weaken it to a `toContain`.
- [ ] The check is wired into `scripts/check-parallel.mjs` as a static gate, so it runs without `WEAVE_BASE` set and without a test process (concurrent `bun test` OOMs this host, per AGENTS.md).
- [ ] `pruneOrphanSpills` still sweeps `SPILL_ROOT` and descends one level into each `<pid>` namespace (`src/async/spill-retention.ts:88-99`). A flat scan of the current namespace can never collect a dead process's files.
- [ ] The compress-before-mkdir ordering and the single ENOENT retry in `spill()` (`src/async/spill.ts:115-134`) remain. `pruneOrphanSpills` deletes namespaces it finds empty, so a sibling sharing `SPILL_ROOT` can `rmdir` one mid-write; the old ordering lost 59 of 60 writes in a two-process hammer.
- [ ] Documentation updated.

## Reconciliation — what to check after any weave-driven rebase

The branch as it stands needs no repair. This is what a maintainer runs when a rebase of `feat-chat-finishers` (or any branch whose base predates `d6ec3e244`) completes, because the rebase is where the hazard would actually materialise:

```bash
# 1. Did the namespace symbols survive the auto-resolution?
git show <post-rebase-sha>:src/async/spill.ts | grep -nE 'SPILL_ROOT|DEFAULT_DIR|setOffloadDir|resetOffloadDir|export function offloadDir|spillRootDir'
#    expect hits at the lines quoted above: SPILL_ROOT=16, DEFAULT_DIR=27,
#    offloadDir()=41, spillRootDir()=49, setOffloadDir()=61, resetOffloadDir()=72

# 2. Only intended changes? (AGENTS.md weave-damage scan)
git diff <pre-rebase-sha> -- src/async/spill.ts

# 3. Observable symptom — a LIVE spill must land in a per-pid namespace.
#    Do NOT assert 'no bare .json.gz at top level': pre-fix residue is
#    legitimately stranded there and never GC'd, so that check false-positives.
#    Instead compare a timestamp older than the fix against a fresh one.
find .tmp/async-store -maxdepth 1 -name '*.json.gz' -newermt '-10 minutes'   # expect NO output
find .tmp/async-store -mindepth 2 -name '*.json.gz' -newermt '-10 minutes'   # expect HITS (namespace is live)

# 4. The per-test override must actually override.
bun test src/async/offload.test.ts    # asserts setOffloadDir moves BOTH the namespace
                                     # and the sweep root (offload.test.ts:56-66)
```

Step 3 is the cheapest ground-truth signal, and the `-newermt` form matters: `.tmp/async-store/` also holds pre-fix residue written before the namespace landed, and `pruneOrphanSpills` only collects files it can reach by descending into a `<pid>` namespace, so that residue is never reclaimed. An unqualified "no bare `.json.gz` at top level" assertion therefore fails on a healthy tree. Restricted to recent mtimes, top-level hits mean a live flat write and the regression is real, regardless of what any static gate says. Step 4's test is already checked in and already asserts the fix; it needs no new test file.

Note that the branch does not need this guard applied by hand — once rebased onto current `dev` it inherits the namespace commits wholesale. The guard is for the window where a rebase auto-resolves these paths, and for any future branch that forks from a pre-`d6ec3e244` base.
