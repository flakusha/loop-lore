<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Delete 69 dead src files reported by knip

**Status:** Not Started
**Type:** Task
**Priority:** low
**Effort:** Medium

**Summary:**

## Dead `src/` files reported by knip

`bun run dead:code:src` reports **69 unused files**.

### This is pre-existing — proven

Proven pre-existing at commit `4510d411`: a `git archive` export of that commit
produced byte-identical knip output (same SHA256). It is **not** caused by any
recent change.

The gate is **ADVISORY**.

### Analysis classification

An analysis classified all 69:

- **63 genuinely dead** — of these, 29 are barrel files that live code
  bypasses by importing the concrete module directly, and 34 are non-barrel
  modules.

- **2 entry-point false positives** — e.g. `src/build/copy-icons.ts` is spawned
  as a shell string and never imported.

- **1 test-only.**
- **3 borderline unwired CLIs** — judgement calls, keep if still reachable by
  hand.

**Zero** were caused by broken imports.

### Note on the count

The gate currently reports **70**, not 69. The 70th is
`src/utils/http-retryable.ts` — an orphan left behind when the abandoned
options-object-params refactor was backed out (its only importer belonged to
that refactor). It is tracked separately from this pre-existing backlog of 69.

### Recommendation

Delete the 63 genuinely dead files in directory-sized batches, running
`bun run typecheck` after each batch.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
