<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: index.json writer sorts keys on write — hand-appended entry causes spurious churn

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Tags:** plan-hygiene, index, false-diff

**Summary:**

`projectIndex` in `scripts/plan/normalize-plan-metadata.ts:386` sorts `index.json` keys on every write, but used code-unit (lexicographic) ordering while giwt's index writer uses `localeCompare`. The file at HEAD was already sorted — the comparators simply disagreed, producing spurious diffs on every regeneration.

A prior repair pass (commit `41209f0f6`) restored HEAD's order after hitting this, but did not fix the root cause.

**Fix landed in commit `1ac20c052`** (`fix(tools): match giwt index comparator, exempt page-lifetime listeners`): added `canonicalIndexOrder()` using `localeCompare` to match giwt's writer. Verified byte-identical output; no one-time sort of the file was needed.

## Evidence

- `scripts/plan/normalize-plan-metadata.ts:386` — `Object.keys(next,).sort()` forces alphabetical key order.
- `index.json` at HEAD contains at least one entry that sorts out of its physical position.
- `git log --oneline -- .plan/tickets/index.json` shows `41209f0f6 fix(plan): collapse multi-epic ticket values and repair stale index epic refs` as a prior repair of this class.
- The churn is a recurring false-diff source in CI and in review workflows.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

## Options

**Option A (landed in 1ac20c052):** Use `localeCompare` in `projectIndex` to match giwt's writer comparator. Result: byte-identical output, no spurious diff. **This is the correct fix.**

**Option B:** Change the writer to preserve existing key order (add new keys at end, don't sort). Would also eliminate spurious churn but changes writer semantics.

**Option C:** Do nothing. Produces spurious diffs.

## Recommendation

Option A is the correct fix.

**Acceptance Criteria:**

- [x] Fix landed: commit `1ac20c052` uses `localeCompare` in `canonicalIndexOrder()` to match giwt's writer
- [x] Verified byte-identical output; no spurious diff
- [x] `plan:validate` passes
- [ ] No regression in `giwt sync` behavior (verified implicitly by validate passing)
