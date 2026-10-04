<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: refund() contract invites over-admission in peek/record flows; vacuous test pins it

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:** refund contract invites over admission in peek record flows
**Context:** Context: fba9dbcd8.
**Acceptance Criteria:** scope refund() docs to consume() flows (or delete the export) and make the test record first.

## Summary

Context: fba9dbcd8. Severity: nit. rate-limit.ts:200-213 refund() docs prescribe refund on post-gate skips (e.g. 409 from insertUnique) but in peek/record flows nothing is recorded before a 409 — following the doc pops an unrelated successful record and re-grants budget. refund() has zero production callers. rate-limit.test.ts:332 'refund releases a slot under sliding-window math' runs against an empty bucket (peek never records) so it pins nothing. Fix: scope refund() docs to consume() flows (or delete the export) and make the test record first.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Verification Notes (2026-10-01)

Re-verified against current `dev`; the defect described in this ticket is
already fixed. The ticket was left open past the fix.

Evidence: `src/middleware/rate-limit.ts:201-203`

- The contract is now documented at the definition: a peek-only flow has recorded nothing, so refunding there would pop an unrelated successful request's timestamp and hand that client free budget.
