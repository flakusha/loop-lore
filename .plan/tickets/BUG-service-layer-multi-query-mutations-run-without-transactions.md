<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Service-layer multi-query mutations run without transactions or conditional writes

**Status:** In Progress
**Priority:** Critical
**Resolved-progress 2026-10-25 (branch fix/bug-sweep, commit "fix(services): make playthrough and encounter completions atomic"):** two legs fixed — (1) completePlaythrough status flip + meta progression now one transaction with conditional status predicate + zero-rows lost-race throw (src/rpg/replayability/service/endings.ts:36-68; repro: trigger aborted meta_progression insert, run stayed Completed pre-fix, stays active now); (2) advancePhase outcome fan-out + completion mark now one transaction with CAS + zero-rows throw (src/rpg/encounters/service/phases.ts:93-130; repro: trigger aborted the nsfw_encounters completion, fan-out stayed applied pre-fix, rolls back now); **Regression-fix 2026-10-25 (commit "fix(rpg): reuse ambient transaction in awardXpToActor"):** review caught that the new completion transaction made the encounter XP leg silently lose leveling — awardXpToActor's own nested .transaction() throws on a Kysely Transaction, so participant-legs.ts's catch downgraded to a bare ledger write and character_stats never got the XP (only worlds with the XP gate on were affected; ledger-row-count assertions cannot see the difference because applyGrant also writes xp_ledger). Fixed by switching awardXpToActor's apply and replay paths to withTransaction (ambient-trx reuse); level-up side-effect semantics unchanged. New discriminating test asserts character_stats.xp = satisfactionBonus under the completion txn (fails without the fix, verified by temporary revert). Mood logEvent also runs under withTransaction so best-effort legs under an ambient trx do not silently drop events (src/characters/services/mood-service/log-event.ts:34-42). **Round-3 2026-10-25 (commits 37f21eceb "fix(crafting): claim the order before fulfil side effects" and a8538e3f3 "fix(trade): unique currency ledger key with upsert guard"):** two more legs fixed — (3) fulfillOrder claims the order with a conditional status UPDATE (accepted → fulfilling, raw-SQL CAS) BEFORE craft/payment, so a concurrent fulfil refuses without crafting or paying; craft/payment failure releases the claim back to accepted (retryable, cancelOrder reachable again) and the final flip is pinned to the claim state (repro: raced pair recorded 2 crafting_attempts and paid twice pre-fix, exactly once post-fix — src/rpg/crafting/orders.test.ts); (4) ensureBalanceRow gained uq_actor_currencies_actor_world_currency via migration 079 (dedupe-first per the 078/030 convention — duplicate ledger groups are always equivalent since every writer updates the whole group to one value; newest row survives) plus an ON CONFLICT DO NOTHING + re-read upsert (repro: raced ensures left 2 actor_currencies rows for one key, now exactly 1 — src/services/trade/balance.test.ts). STILL OPEN (verified live on tip): trade/core.ts validates lines on raw db pre-txn and in-txn failure paths are bare returns that commit partial debits; achievements updateProgress SELECT-then-INSERT no txn/UNIQUE; blog posts updatePost 3 queries; body heat advanceHeatCycle; story items transfer unscoped writes; rpg questions answerQuestion 3-query sequence; loot persist quest_reward_ledger pre-check; crafting placeOrder quantity/offeredPayment guard; achievements deleteAchievement DONE (prior); bdi-nightly insertPlan loop. Gates: typecheck + eslint green 2026-10-25.
**Effort:** Medium
**Epic:** epic-data-integrity-acid

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

Closure rationale (2026-10-25, branch `fix/bug-sweep`): the sweep made the playthrough-completion and encounter-phase legs transactional (conditional status predicates, zero-rows lost-race throws) and reused the ambient transaction for the XP award — see the Resolved-progress entry above. The ticket stays In Progress until the remaining legs land.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
