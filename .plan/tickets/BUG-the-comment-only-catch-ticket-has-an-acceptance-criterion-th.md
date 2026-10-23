<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: The comment-only catch ticket has an acceptance criterion that cannot be satisfied

**Status:** Not Started
**Priority:** Low
**Effort:** Medium
**Epic:** epic-continuous-improvement

**Summary:**

TASK-comment-only-catch-blocks-in-src-frontend-are-invisible-to-e carries an acceptance criterion naming a reporter that has no bucket for catch blocks, plus a Context claim that is false, plus an arithmetic mismatch that could not be reproduced.

1. Unsatisfiable criterion. The ticket asks that 'the banned-pattern reporter's finding count for this bucket drops to 0 (run scripts/check-frontend-banned-patterns.ts and quote the before/after counts)'. That reporter's buckets, at scripts/check-frontend-banned-patterns.ts:40-46, are void-fire-forget, fetch-no-catch, storage-no-try, eval-usage and listener-leak. There is no catch bucket, so the count cannot be measured as written.

2. False Context claim. The ticket states these findings are reported into the check report's nonBlocking notes. That is true for the reporter as a whole (scripts/check/parallel/nonblocking.mjs:69 spawns it) but not for catch blocks, since it has no bucket.

3. The count is wrong and its provenance is missing. The ticket states 105 comment-only catches. Measured on current dev with .tmp/step-5/catch_prod.py (a string/template/comment-aware brace counter; production files only, tests excluded) the real census is 367 catch clauses of which 120 are comment-only, 247 contain statements, and 0 are truly empty. Test files add 7 clauses, 4 of them comment-only. The 105 matches no subset: it is not the production count, the all-files count (124), or any per-directory total. The largest concentrations are src/frontend/alpine (99 of 284) and src/frontend/pages (13 of 41). scripts/check-frontend-banned-patterns.ts contains no 105 constant, so the number was never derived from a repeatable measurement.

4. The zero-truly-empty claim IS confirmed and is the load-bearing part of the ticket: no production catch block in src/frontend is truly empty, so no-empty can report none of them. A probe with no-empty: error and allowEmptyCatch: false reports a truly-empty catch {} and reports nothing for a catch whose body is only a comment. The core thesis holds; only the census and the gate are wrong.

Fix direction: replace criterion 1 with a real census gate (or add a catch bucket to the reporter), correct the Context sentence, and replace 105 with the measured 120 (124 including tests).

Source: .tmp/step-5/repository-review.md F3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
