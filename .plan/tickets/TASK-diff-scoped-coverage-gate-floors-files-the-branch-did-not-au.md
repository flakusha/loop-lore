<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Diff-scoped coverage gate floors files the branch did not author when the branch is behind its base

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The diff-scoped coverage gate computes its scope with a two-dot tree-vs-tree diff (git diff --name-only `<base>` HEAD), so a file that only the BASE moved - because the branch is behind dev - is still in scope and still floored per-file. The branch is then blocked on coverage debt it did not create. Evidence: scripts/check/parallel/context.mjs:113-139 changedFiles(base) - git diff --name-only base HEAD plus git diff --name-only HEAD (working tree); scripts/check/parallel/context.mjs:227-228 SCOPED_DIFF_SRC_FILES filters that list to non-test src files; scripts/check/parallel/gates.mjs:106-115 passes the whole list to the coverage gate as --files=, and scripts/check/coverage/diff-mode.mjs floors each listed file individually. Measured 2026-10-25 on real branches: bugfix-routes gate scope 9 non-test src files vs 8 files the branch itself authored (merge-base c340d120, dev 7 commits ahead of the merge-base, branch 2 ahead) - the extra floored file is src/utils/safe-regexp.ts, which the branch never touched; feat-message-translations gate scope 60 vs branch-owned 60 (branch up to date with dev, so no divergence). Failure scenario: a branch cuts from dev, dev lands a change to src/utils/safe-regexp.ts, the branch does not touch that file; at finalize the gate scopes that file in, the scoped lcov does not cover it (the scoped test run never loads it), and the per-file floor fails on a file the branch never authored - a false red that blocks finalize on pre-existing debt. Not a duplicate of BUG-diff-scoped-gates-diff-against-a-stale-merge-base (Done): that ticket fixed the stale merge-base explosion and explicitly accepts the two-dot superset as a documented over-scope; this ticket proposes narrowing that superset, not re-reporting it. Not a duplicate of TASK-waive-seven-diff-scoped-coverage-floors-surfaced-by-jsdoc: that separate proposal is on the code-vs-path axis (comment-only diffs still floor a file); this one is on the authorship axis (a file the branch never touched). Fix direction: keep the two-dot diff as the superset and filter it - intersect the scope with the branch's OWN file list (files touched by commits reachable from HEAD but not from the base), so a file the branch and base both changed stays in scope and a file only the base changed drops out. Do NOT switch to a merge-base diff - that was the earlier, wider explosion the Done ticket closed. Acceptance: scope for a branch behind dev equals the branch-owned file set; a branch that changed a file stays floored on it.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
