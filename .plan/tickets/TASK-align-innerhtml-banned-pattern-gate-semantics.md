<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Align innerHTML + banned-pattern gate semantics

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** high
**Effort:** Small

## Summary

Two semantic mismatches in the runner-gate contracts:

1. **B4** — `scripts/check-frontend-innerhtml-xss.ts` prints "(advisory)" and warns on findings (lines 15-18, 145-168), but the runner invokes it without `|| true` (`scripts/check-parallel.mjs:318`), so findings BLOCK. The label and behavior disagree.
2. **B5** — `scripts/check-frontend-banned-patterns.ts` exits 1 on findings (the reporter emits 163 findings today), but the runner appends `|| true` (`scripts/check-parallel.mjs:321`). Findings are discarded silently — the gate cannot fail, but it cannot inform either.

## Where

- scripts/check-frontend-innerhtml-xss.ts (header banner lines 14-18, warning logic 145-168)
- scripts/check-frontend-banned-patterns.ts (header banner)
- scripts/check-parallel.mjs (lines 317-321)

## Acceptance Criteria

- [ ] innerHTML script's header banner matches runner behavior (advisory → non-blocking label matches `|| true`; blocking → drop "advisory" text and remove `|| true`).
- [ ] banned-pattern output is captured in the runner's `nonBlocking` report (visible findings, green gate) rather than discarded.
- [ ] A controlled banned-pattern finding appears in the check report's `nonBlocking` section.
- [ ] InnerHTML stays blocking on real findings (current behavior preserved unless explicitly downgraded).


git issue: 08d2d8f
