<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Context window reorders messages sharing an identical createdAt

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

src/chat/context-window.ts:103 (and phase-3 comparator at :122) sort only by createdAt.localeCompare with no tiebreaker. The recent block is pushed first (~:80-84), then phase 2 appends older messages newest-to-oldest (push at ~:99), so for identical timestamps the retained order comes out m5,m6,m4,m3,m2,m1 — contradicting the stated intent "Sort retained messages back to chronological order" at ~:102. Not a JS sort-stability issue; a missing-tiebreaker bug. Fix: tiebreak on input index/seq in both comparators. No existing test pins the tie case (context-window.test.ts derives distinct createdAt per index). Evidence: execution probe on branch edge-case-tests-20261101 sweep 2026-11-01 (worktree .tmp/probe-context-window.ts, run by session edge-tests).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

Imported from git issue d3c44af.

git issue: d3c44af
