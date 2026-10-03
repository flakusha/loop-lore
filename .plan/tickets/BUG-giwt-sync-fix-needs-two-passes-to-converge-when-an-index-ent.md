<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: giwt sync --fix needs two passes to converge when an index entry points at a closed issue with an open same-extid duplicate

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Tags:** giwt, tooling, sync-index

**Summary:**

## Observed

`giwt sync --fix` exits 1 on its first pass even though it applied the fix for the very category it is complaining about. A second identical pass exits 0. Reproduced on TASK-TMP-JANITOR-AND-STALENESS-MARKERS.

## Mechanism (stale-read ordering)

`reconcile()` runs once, up front, at node_modules/giwt/src/tickets/sync-index.ts:948. It populates `report.staleOpenGitIssues` from the index as it was BEFORE any fix.

`applyFixes()` is called later, at sync-index.ts:1259, and walks `report` — the already-computed pre-fix snapshot.

The relink block at sync-index.ts:689-703 rewrites an index entry from a CLOSED issue to an OPEN duplicate sharing the same extid:

    fixed[extid] = { ...entry, hash: openDup.hash, git_issue: openDup.hash };

The close block at sync-index.ts:872-883 iterates `report.staleOpenGitIssues` — which does NOT contain the newly-relinked sha, because the relink happened after reconcile computed it. So the pass that creates the stale-open condition is structurally incapable of closing it.

The post-fix re-scan at sync-index.ts:1286-1300 does detect it (it re-reads the registry and re-reconciles against `fixedIndex`), and `postTotal > 0` drives the exit code at sync-index.ts:1326. Hence: fix applied, re-scan sees the residue, run exits 1.

## Sequence that triggered it

Two git issues shared extid TASK-TMP-JANITOR-AND-STALENESS-MARKERS, created 5 seconds apart by a duplicate import:
- f6100bac (2026-09-26 12:55:51) — later auto-closed 2026-10-01 14:17:41
- df4c473c (2026-09-26 12:55:46) — left open

Index pointed at the closed f6100ba. Pass 1 relinked to open df4c473c and exited 1. Pass 2 closed df4c473c and exited 0.

## Impact

Any automation that runs `sync --fix` exactly once and checks the exit code (CI, pre-commit, an agent following the documented single-pass flow) reports a false failure and may retry or give up. It also forces two full registry scans where one would do.

## Suggested fix

Re-derive `staleOpenGitIssues` from `fixed` after the relink block, or move the relink before the close pass and have the close pass consume post-relink state. Alternatively: when the relink target is an open duplicate whose extid the index marks done, close it in the same pass.

## Trigger condition (precise)

The bug fires only when BOTH `hash` and `git_issue` point at the SAME closed sha. The stale-open check keys off `entry.git_issue` (sync-ticket.ts:417-430); the relink keys off `entry.hash` (sync-index.ts:689-703). When both fields name the closed issue, the stale-open list is empty at reconcile time, the relink then introduces an open sha, and nothing closes it in that pass.

Verified against the real index at bc3b89ee8, which had `"git_issue": "f6100ba"` AND `"hash": "f6100ba"` — both on the closed sha.

## Test gap (NOT an existing wrong expectation)

sync-index-run.test.ts:813-848 ("--fix relinks an index hash that points at a closed issue to its open duplicate") covers the relink and PASSES today. It asserts single-pass convergence, not two-pass: `expect(exit).toBe(0)` and `expect(out).toContain("closed git issue ${iNew}")`.

It passes because its fixture sets `hash: iOld` (closed) but `git_issue: iNew` (already open) — sync-index-run.test.ts:826-827. With `git_issue` already naming the open duplicate, the stale-open list is populated at reconcile time, so the close pass has the sha and converges in one run.

The untested case is the real-world one: both fields on the closed sha. Add a fixture with `hash` and `git_issue` both set to the closed issue plus an open same-extid duplicate, and assert `exit === 0` with the duplicate closed within the SAME run. That test should fail against current code.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
