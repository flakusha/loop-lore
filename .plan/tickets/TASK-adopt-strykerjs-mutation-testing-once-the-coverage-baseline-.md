<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Adopt StrykerJS mutation testing once the coverage baseline is solid

**Status:** Not Started
**Priority:** low
**Effort:** Large
**Epic:** epic-api-library-distribution

**Summary:**

Deferred, not rejected, in docs/meta/auto-test-generation.md section 6. Stryker has a real official Bun runner and would answer the question the test-gap gate cannot: not "is this export referenced by a test" but "would the suite notice if this assertion were wrong". A surviving mutant is a weak assertion the gap gate counts as coverage.

It was deferred because a mutation score measured under a thin coverage baseline is noise, and each mutant costs a full test run. That reasoning still holds. Revisit once the coverage-per-module gate has been green long enough that the baseline is trustworthy.

Scope it narrowly when it lands — run per-directory, not tree-wide, and treat the score as a ratchet with a committed baseline in the same shape as test-gaps.mjs.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
