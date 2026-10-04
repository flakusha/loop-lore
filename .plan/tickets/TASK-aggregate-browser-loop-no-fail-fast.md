<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Browser test loop must aggregate, not fail-fast

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** high
**Effort:** Small

## Summary

Both the package and CI browser loops use `|| exit 1`
(`package.json:72`, `.github/workflows/ci.yml:136`). The first failing
`.browser.ts` file stops the suite, hiding every later regression. A
controlled `a-fail/b-pass` pair confirms `b-pass` never runs. The aggregate
probe of all 34 browser files found 16 failing ones; the checked-in loop
would have stopped at the first failure and hidden the rest.

## Where

- package.json script `test:e2e:browser` (line 72)
- .github/workflows/ci.yml job `test-browser` (lines 134-138)

## Acceptance Criteria

- [ ] Both package and CI loops execute every `*.browser.ts` file before exiting.
- [ ] Final exit code is non-zero when ANY file fails.
- [ ] Controlled `a-fail` + `b-pass` pair shows both files ran and exit is 1.
- [ ] Output identifies which files failed (not just the first).


git issue: 41b26ce
