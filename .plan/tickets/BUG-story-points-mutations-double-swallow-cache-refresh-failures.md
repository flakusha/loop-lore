<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Story-points mutations double-swallow cache-refresh failures silently

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:** story points mutations double swallow cache refresh failures
**Context:** Context: 681e6605e.
**Acceptance Criteria:** drop the outer .catch or log at debug.

## Summary

Context: 681e6605e. Severity: nit. mutations.ts:72,140 add void refreshActorStoryPointsCache(...).catch(() => {}) — the helper already swallows internally (double swallow, zero log). Fix: drop the outer .catch or log at debug.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Verification Notes (2026-10-01)

Fixed on `dev` in commit `1a0e6c41`.

- `refreshActorStoryPointsCache` already had an internal `try/catch`, so the
  `.catch(() => {/* swallow */})` appended by `earnStoryPoints` and
  `spendStoryPoints` was unreachable — two swallows, neither observable.
- The inner catch swallowed silently, which made the function's own JSDoc
  ("Errors are logged and swallowed") untrue. It now emits
  `log.warn("story_points_cache.refresh_failed", …)`. Absorbing the failure is
  still correct — the canonical `actor_story_points` ledger is already
  committed by that point — it just is no longer invisible.
- Both call sites use a bare `void` again.
- Regression test `story-points.test.ts` › "refreshActorStoryPointsCache -
  best-effort contract" pins the resolves-don't-reject contract that makes the
  bare `void` safe. Verified load-bearing by mutation: rethrowing from the
  inner catch turns it red (31 pass / 1 fail); reverting returns 32 pass.
