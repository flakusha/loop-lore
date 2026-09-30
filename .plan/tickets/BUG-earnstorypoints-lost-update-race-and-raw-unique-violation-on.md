<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: earnStoryPoints lost-update race and raw UNIQUE violation on first earn

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:** earnstorypoints lost update race and raw unique violation on
**Context:** Context: src/services/agency/story-points/mutations.ts:39-68 (landed 681e6605e).
**Acceptance Criteria:** transaction with relative UPDATE balance = balance + amount and INSERT ... ON CONFLICT DO NOTHING (020's partial unique index makes the conflict target expressible); keep CapExceeded check inside the txn.

## Summary

Context: src/services/agency/story-points/mutations.ts:39-68 (landed 681e6605e). Severity: blocking. SELECT-then-absolute-UPDATE outside a transaction: concurrent earns compute newBalance from a stale read and write it absolutely (earned_total increments relatively → balance drifts from earned−spent invariant). Concurrent first-time earns both take the INSERT branch → second throws raw SQLITE UNIQUE (uq partial index) → 500 from /agency earn. Repro: parallel earnStoryPoints on fresh actor. Fix: transaction with relative UPDATE balance = balance + amount and INSERT ... ON CONFLICT DO NOTHING (020's partial unique index makes the conflict target expressible); keep CapExceeded check inside the txn.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
