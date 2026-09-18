<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: worktree report crashes on malformed or missing check reports

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done
**Priority:** Medium
**Effort:** Medium

## Summary

`scripts/worktree/ report` (cmdReportLs flow, also surfaced via check-parallel report-ls aggregation) throws `Object.entries requires that input parameter not be null or undefined` when a worktree's `.tmp/check-report.json` is malformed or has missing sections. One bad worktree aborts the whole cross-worktree audit. Fix direction: per-worktree try/catch in the aggregation loop; render a `malformed report` row instead of throwing.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Resolved by commit `b34d96a8b` (authored 2026-09-09; landed on `dev` 2026-09-13 via rebase `pick`, per `.git/logs/HEAD` entry 2117). `scripts/worktree/commands/report.ts` introduces `parseReport(raw)` which validates the JSON root and the `gates` object before narrowing to `CheckReport`; a new `printMalformedRow(name, error)` renders a row tagged `malformed report - <message>`. Each scan site (main repo, container dirs, git worktree fallback) wraps `readFile + parseReport + printReportRow` in its own `try/catch` so one bad report prints the row and continues.

Tests: `scripts/worktree/commands/report.test.ts` — 5 passing cases: missing report file → `no report` row; unparseable JSON → `malformed report` row; root object missing `gates` → `malformed report` row; malformed main repo report → `malformed report` row for `(main)`; external git worktree (omp sibling layout) is included via the `getWorktrees` fallback.
