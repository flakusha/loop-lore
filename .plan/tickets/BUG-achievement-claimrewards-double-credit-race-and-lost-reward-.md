<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Achievement claimRewards double-credit race and lost reward on crash

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-rpg-content-systems.md
**Tags:** rpg-content-systems

**Summary:** achievement claimrewards double credit race and lost reward
**Context:** Context: src/rpg/achievements/service/progress.ts:144-182.
**Acceptance Criteria:** wrap claim+payout in db.transaction; gate UPDATE on claimed_at IS NULL and require numAffectedRows===1 before earning; mirror spendStoryPoints conditional-UPDATE pattern.

## Summary

Context: src/rpg/achievements/service/progress.ts:144-182. Severity: blocking. Check-then-act: claimedAt read at L152, unconditional UPDATE at L159-168, earnStoryPoints payout at L171-173 — no transaction, no conditional-UPDATE guard. Two concurrent POST /claim both pass the check → double currency credit; crash between UPDATE and payout permanently loses the reward. Repro: two parallel claimRewards calls on a fresh unlocked achievement. Fix: wrap claim+payout in db.transaction; gate UPDATE on claimed_at IS NULL and require numAffectedRows===1 before earning; mirror spendStoryPoints conditional-UPDATE pattern.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
