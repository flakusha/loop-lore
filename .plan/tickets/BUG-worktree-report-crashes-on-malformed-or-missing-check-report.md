<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: worktree report crashes on malformed or missing check reports

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

scripts/worktree/ report (cmdReportLs flow, also surfaced via check-parallel report-ls aggregation) throws 'Object.entries requires that input parameter not be null or undefined' when a worktree's .tmp/check-report-latest.json is malformed or has missing sections. One bad worktree aborts the whole cross-worktree audit. Fix direction: per-worktree try/catch in the aggregation loop; render a 'malformed report' row instead of throwing.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
