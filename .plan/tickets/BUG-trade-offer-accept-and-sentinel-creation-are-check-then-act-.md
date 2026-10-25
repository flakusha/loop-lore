<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Trade offer accept and sentinel creation are check-then-act races

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — both windows closed in src/services/trade/offers.ts — (1) ensureTradeSentinel (:26-84) now runs its two inserts in ONE transaction with ON CONFLICT DO NOTHING, so a losing concurrent createOffer is a no-op instead of an unhandled SQLITE_CONSTRAINT crash (the pre-SELECT stays as the fast path); (2) loadOfferForAccept (:130-207) atomically CLAIMS the offer — raw-SQL conditional UPDATE `set status='accepted' where id=? and status=<as-read>` mirroring the repo CAS pattern (src/db/optimistic-locking.ts:100-106, since the Kysely query-builder UpdateResult does not surface numAffectedRows on this driver) — exactly one racing accept gets the row, the loser receives a `{success:false}` result with reason `offer no longer open (another accept won the race)` and the lifecycle caller (src/services/trade/lifecycle.ts:72-91) never dispatches tradeCore for it. Repros in src/services/trade/offers-race.test.ts (6 tests): before-evidence (captured): concurrent sentinel creation REJECTED (unique constraint), racing accepts returned 2 wins/0 losses, sequential second accept succeeded, countered-accept left status unclaimed — 2 pass / 4 fail pre-fix; 6/6 post-fix, trade index.test.ts 13/13 unaffected. Gates: typecheck + eslint green (run 802096-mvnh4ec6), worktree fix/bug-sweep, issue BUG-TRADE-OFFER-ACCEPT-AND-SENTINEL-CREATION-ARE-CHECK-THEN-ACT-.
**Priority:** Critical
**Effort:** Medium
**Epic:** epic-mini-games

**Summary:**

Two TOCTOU windows in the trade offer service, both caused by a check being issued in one statement and the effect in a second with no transaction and no conditional UPDATE.

1. ensureTradeSentinel. src/services/trade/offers.ts:30-33 SELECTs for the sentinel and :35 early-returns; :40-70 then INSERTs items and recipes as two separate statements with no transaction and no ON CONFLICT. Two concurrent createOffer calls both see no sentinel and both attempt the raw INSERT; the second fails with an unhandled SQLITE_CONSTRAINT.

2. loadOfferForAccept. src/services/trade/offers.ts:148-174 SELECTs and checks status, deadline and permission outside any transaction; the lifecycle caller at src/services/trade/lifecycle.ts:72 awaits it and then :81 calls tradeCore in a separate await. Two concurrent acceptOffer calls both pass the check window and both execute tradeCore, double-debiting the buyer and double-transferring the items.

Fix: make both the sentinel insert and the accept status flip conditional (INSERT OR IGNORE / UPDATE ... WHERE status = 'open') and treat zero affected rows as a lost race.

Source: .tmp/longcat/review-plugins-services.md H1 and H4.

**Context:**

Closure rationale (2026-10-25, branch `fix/bug-sweep`): both windows closed in src/services/trade/offers.ts — (1) ensureTradeSentinel (:26-84) now runs its two inserts in ONE transaction with ON CONFLICT DO NOTHING, so a losing concurrent createOffer is a no-op instead of an unhandled SQLITE_CONSTRAINT crash (the pre-SELECT stays as the fast path); (2) loadOfferForAccept (:130-207) atomically CLAIMS the offer — raw-SQL conditional UPDATE `set status='accepted' where id=? and status=<as-read>` mirroring the repo CAS pattern (src/db/optimistic-locking.ts:100-106, since the Kysely query-builder UpdateResult does not surface numAffectedRows on this driver) — exactly one racing accept gets the row, the loser receives a `{success:false}` result with reason `offer no longer open (another accept won the race)` and the lifecycle caller (src/services/trade/lifecycle.ts:72-91) never dispatches tradeCore for it.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue aa7abb5 (registry tip: ff7c432f0 Konstantin Fedotov Close issue)
