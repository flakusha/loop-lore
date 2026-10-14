<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Service-layer multi-query mutations run without transactions or conditional writes

**Status:** Not Started
**Priority:** Critical
**Effort:** Medium

**Summary:**

One root cause across the service layer: composite state changes are issued as several independent queries with no shared transaction and no conditional (WHERE ...) predicate, so a mid-sequence failure leaves partial state and concurrent callers double-apply. Verified on dev:

RPG

- src/rpg/achievements/service/crud.ts:138-146 deleteAchievement — two DELETEs, no transaction.
- src/rpg/achievements/service/progress.ts:72-94 updateProgress — SELECT then INSERT, no transaction, no UNIQUE(player_id, achievement_id); two concurrent calls both read null and both insert.
- src/rpg/blog/service/posts.ts:244-255 updatePost — update, clearTags, addTags as three queries.
- src/rpg/encounters/service/phases.ts:98-110 advancePhase — applyOutcomes then status update; a re-run re-applies every outcome.
- src/rpg/questions/service.ts:227-257 answerQuestion — status update, applyQuestionEffects, then the system message insert.
- src/rpg/crafting/orders.ts:83-102 placeOrder — no service-level guard on quantity or offeredPayment before insert.
- src/rpg/crafting/orders.ts:165-194 fulfillOrder — attemptCraft, then trade payment, then status update, all outside a transaction and with no CAS on status; a concurrent fulfill double-crafts and double-pays.
- src/rpg/body-systems/service/heat.ts:126-157 advanceHeatCycle — read, compute, write, no transaction.
- src/rpg/replayability/service/endings.ts:39-53 completePlaythrough — status update then updateMetaProgression.

Trade and money

- src/services/trade/core.ts:72-75 validates item lines on db before opening the transaction; :86-131 every failure path is a plain return from the transaction callback, so Kysely resolves normally and commits whatever ran before the failure.
- src/story/items/instances.ts:40-124 transfer reads the source row outside the write and its UPDATE/DELETE carry no ownership or quantity predicate.
- src/services/trade/balance.ts:23-51 ensureBalanceRow is SELECT-then-INSERT with no unique constraint on (actor_id, world_id, currency_type).
- src/rpg/loot/persist.ts:94-129 the quest_reward_ledger exists-check runs before the transaction that inserts it.

Agency

- src/services/agency/bdi-nightly.ts:157-182 insertPlan writes the plan row, then a loop of separate activity inserts; the next night's prevPlan lookup finds the partial plan.

Source: .tmp/longcat/review-assets-db-frontend.md N2-N10; .tmp/cat-jam/review-models-rpg.md P1-2, P1-3, P2-4, P2-5; .tmp/longcat/review-plugins-services.md H3.

Positive contrast to keep: src/rpg/achievements/service/progress.ts:147-204 claimRewards and src/rpg/level/service.ts:56-78 already do the conditional-UPDATE-inside-a-transaction shape this ticket asks for everywhere else.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
