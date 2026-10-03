<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: --gates=<csv> equals-form is silently ignored; only the space-separated form is parsed

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

Only the space-separated form of the gate filter is parsed. `--gates=<csv>` is silently ignored, so a mistyped or `=`-style filter runs the entire suite instead of the intended subset.

## Cause

`parseGateFlag` uses `process.argv.indexOf(flag)` and reads `argv[idx + 1]` (`scripts/check/parallel/context.mjs:45-51`):

```js
function parseGateFlag(flag,) {
  const idx = process.argv.indexOf(flag,);
  if (idx === -1 || idx + 1 >= process.argv.length) { return null; }
  const raw = process.argv[idx + 1];
```

`indexOf("--gates")` never matches the single argv element `"--gates=nonexistent-gate-xyz"`, so the filter is `null` and no whitelist is applied.

## Reproduction

```
$ bun scripts/check-parallel.mjs --gates=nonexistent-gate-xyz
gates filter: ...   (not printed)
=== loop-lore parallel check runner ===
Running 30 checks with concurrency=1 ...
```

The whole suite runs. The expected behaviour for an unknown gate name is exit 2 with the available-gate list, which the space form does produce.

## Asymmetric severity — only the `=` form is a silent hazard

The space form fails loudly. A trailing flag with no value is consumed as a gate name:

```
$ bun scripts/check-parallel.mjs --gates --jobs 2
error: unknown gate name(s): "--jobs"
available gates:
  backlog - index
  ...
EXIT=2
```

So a user who writes `--gates --jobs 2` gets an immediate, diagnosable error. A user who writes `--gates=nonexistent-gate-xyz` gets no signal at all. The `=` form is the only spelling whose failure mode is invisible.

## Why it survived

Two module doc comments advertise the `=` spelling (`context.mjs:36-37`): "`--gates=<csv>` runs ONLY the named checks (whitelist). `--skip-gates=<csv>` runs every check EXCEPT the named ones". The usage header is correct and documents the space form (`check-parallel.mjs:11`: `[--gates <csv>]`), so the two sources disagree.

All 8 tests in `scripts/check-parallel.gates.test.mjs` use the space form via `runRunner(["--gates", "bogus-gate-xyz",])` (`:200`), `runRunner(["--gates", "md - lint", "--skip-gates", "lint - eslint",])` (`:326`), and the whitespace-only case (`:333-337`). The `=` spelling has **zero** coverage.

Pre-existing, not introduced by the module split: `git show 5267ff04e^:scripts/check-parallel.mjs` has the identical `parseGateFlag` at lines 121-124.

## Fix direction

Parse both spellings — match `arg === flag` for the space form and `arg.startsWith(flag + "=")` for the inline form — and reject an unknown gate name in either case with the existing exit-2 diagnostic. Add tests for `--gates=` and `--skip-gates=`.

## Acceptance Criteria

- [ ] `--gates=<csv>` and `--skip-gates=<csv>` are honoured, not ignored
- [ ] An unknown name in the `=` form exits 2 with the available-gate list
- [ ] `context.mjs:36-37` doc comments match the spelling actually accepted, or both spellings are documented
- [ ] Tests cover both spellings

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
