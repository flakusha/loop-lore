<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Trade offer accept and sentinel creation are check-then-act races

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Two TOCTOU windows in the trade offer service, both caused by a check being issued in one statement and the effect in a second with no transaction and no conditional UPDATE.

1. ensureTradeSentinel. src/services/trade/offers.ts:30-33 SELECTs for the sentinel and :35 early-returns; :40-70 then INSERTs items and recipes as two separate statements with no transaction and no ON CONFLICT. Two concurrent createOffer calls both see no sentinel and both attempt the raw INSERT; the second fails with an unhandled SQLITE_CONSTRAINT.

2. loadOfferForAccept. src/services/trade/offers.ts:148-174 SELECTs and checks status, deadline and permission outside any transaction; the lifecycle caller at src/services/trade/lifecycle.ts:72 awaits it and then :81 calls tradeCore in a separate await. Two concurrent acceptOffer calls both pass the check window and both execute tradeCore, double-debiting the buyer and double-transferring the items.

Fix: make both the sentinel insert and the accept status flip conditional (INSERT OR IGNORE / UPDATE ... WHERE status = 'open') and treat zero affected rows as a lost race.

Source: .tmp/longcat/review-plugins-services.md H1 and H4.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
