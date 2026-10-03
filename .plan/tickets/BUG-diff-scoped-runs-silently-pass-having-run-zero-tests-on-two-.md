<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Diff-scoped runs silently pass having run zero tests, on two distinct paths

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Two independent paths let a `--diff-base` run report success while having done nothing, or while dying before it could write any record of the attempt. They are the opposite failure from the stale-merge-base scope explosion tracked elsewhere (see "Relationship to the existing ticket" below): that one makes the scope too large, these make it collapse to zero.

## Path A — stale diff-base throws during module init, so no report is written

`changedFiles()` calls `execFileSync("git", ["merge-base", base, "HEAD"])` with **no try/catch** (`scripts/check/parallel/context.mjs:67-71`), and it is invoked at **module init** (`context.mjs:173`: `const CHANGED = changedFiles(DIFF_BASE,)`). A stale or pruned base ref therefore throws before `main()` is ever called, so the `main().catch()` report writer at `scripts/check-parallel.mjs:99-117` never fires.

Reproduced:

```
$ bun run scripts/check-parallel.mjs --diff-base nonexistent-ref-xyz
fatal: Not a valid object name nonexistent-ref-xyz
      at changedFiles (scripts/check/parallel/context.mjs:67:21)
      at scripts/check/parallel/context.mjs:173:17
EXIT=1
```

`.tmp/check-report.json` mtime was unchanged across the run (still `2026-10-03 11:17:05` before and after), confirming no artifact is written. The operator gets a raw Bun stack dump and a stale report that some tooling may still read as the last known state.

Note the asymmetry: `scripts/worktree/commands/finalize.ts:562-565` already documents the *caller* being fixed for exactly this case. The runner side was not.

## Path B — empty diff scope is recorded as a passing check

`coverageCommand()` returns `NOOP_OK` for an empty diff scope (`gates.mjs:199-200`: `if (SCOPED_COVERAGE_PATHS.length === 0) { return NOOP_OK; }` / `if (SCOPED_DIFF_SRC_FILES.length === 0) { return NOOP_OK; }`, also `:205`). `NOOP_OK` is the literal shell string `"true # diff-scope: no matching files"` (`context.mjs:182`), and the runner records it as `passed: true`.

Reproduced on a clean tree:

```
$ bun run scripts/check-parallel.mjs --diff-base HEAD --gates "coverage - per-module line %"
gates filter: whitelisted 1 of 30 gates
PASS: coverage - per-module line %
...
=== All checks passed ===          EXIT=0
```

and in the resulting `.tmp/check-report.json`:

```json
"command": "true # diff-scope: no matching files",
"passed": true,
```

So a docs-only or `.plan/`-only branch reports "All checks passed" having run zero tests. A no-op is defensible as a *behaviour*; recording it as a *passed check* is not, because the report is the provenance record that `check:report-ls` and the coverage ratchet consume.

## Relationship to the existing ticket

`BUG-diff-scoped-gates-diff-against-a-stale-merge-base-so-scope-e` covers a different failure of the same subsystem: a stale merge-base makes scope **explode** (1295 files floored instead of 109). These findings are the opposite direction — scope **collapsing to zero**. Same code path, opposite polarity, and fixing one does not fix the other. Filed as a separate ticket rather than folded in, because Path A (unguarded `execFileSync` at module init) and Path B (`NOOP_OK` recorded as a pass) are independent defects with independent fixes, whereas the existing ticket is about scope *size*.

Note also that the existing ticket's `.md` file is **untracked in git** — it is not in any commit, which is what currently breaks the plan gates (see PART 3 of the originating work; tracked separately).

## Acceptance Criteria

- [ ] A stale or unresolvable `--diff-base` produces a diagnostic naming the ref, and a check report is still written (exit non-zero)
- [ ] `changedFiles()` failure does not escape module init uncaught
- [ ] `NOOP_OK` is distinguishable from a genuinely-passed check in the report (e.g. `skipped: true`, or an explicit `noop` marker), and the summary does not count it as "passed"
- [ ] Regression tests for both paths

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
