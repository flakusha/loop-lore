<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: index.json writer sorts keys on write — hand-appended entry causes spurious churn

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Tags:** plan-hygiene, index, false-diff

**Summary:**

`projectIndex` in `scripts/plan/normalize-plan-metadata.ts:386` sorts `index.json` keys on every write:

```
for (const k of Object.keys(next,).sort()) { sorted[k] = next[k]; }
```

However, `index.json` at HEAD is NOT fully sorted — it contains a hand-appended entry out of sorted position. Every regeneration produces a spurious diff that moves only that entry. A prior repair pass (commit `41209f0f6`) hit exactly this and had to restore HEAD's order.

## Evidence

- `scripts/plan/normalize-plan-metadata.ts:386` — `Object.keys(next,).sort()` forces alphabetical key order.
- `index.json` at HEAD contains at least one entry that sorts out of its physical position.
- `git log --oneline -- .plan/tickets/index.json` shows `41209f0f6 fix(plan): collapse multi-epic ticket values and repair stale index epic refs` as a prior repair of this class.
- The churn is a recurring false-diff source in CI and in review workflows.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

## Options

**Option A:** Change the writer to preserve existing key order (add new keys at end, don't sort). Eliminates spurious churn.

**Option B:** Deliberately sort `index.json` once, then accept sorted output as canonical. Eliminates spurious churn but changes the file's canonical order.

**Option C:** Do nothing. Every `plan:sync:fix` or `plan:matrix` run produces a spurious diff.

## Recommendation

Option A (preserve order) — lowest risk, no behavioral change, eliminates the false diff.

**Acceptance Criteria:**

- [ ] Decision made and implemented
- [ ] `index.json` regenerated without spurious diff
- [ ] `plan:validate` passes
- [ ] No regression in `giwt sync` behavior
