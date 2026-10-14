<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Turn-manager selection uses a stale candidate list and a read-then-write initiative decrement

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Two concurrency defects in src/turning/turn-manager/selection.ts.

1. Stale candidates on CAS retry. candidates is computed once at line 40 from a participants/cooling snapshot taken before persistState. persistState re-runs its mutation closure against freshly committed state on a CAS conflict, but candidates is captured outside that closure, so a retry selects from the pre-rebase participant set.

2. TOCTOU in decrementInitiative. Lines 97-113 read group_initiatives.score, compute nextScore, then issue an unconditioned UPDATE with no score predicate, so two concurrent recordTurn calls both read the same score and the later write clobbers the earlier decrement.

Evidence read on dev:

- src/turning/turn-manager/selection.ts:39-40 — eligible/candidates computed outside persistState.
- src/turning/turn-manager/selection.ts:49-64 — persistState closure uses the captured candidates array.
- src/turning/turn-manager/selection.ts:97-113 — SELECT then UPDATE with no WHERE score = :current.

Source: .tmp/longcat/review-consolidated.md nits 14 and 15.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
