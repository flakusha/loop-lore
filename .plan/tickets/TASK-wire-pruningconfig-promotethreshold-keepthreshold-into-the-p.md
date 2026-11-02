<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Wire PruningConfig.promoteThreshold/keepThreshold into the pruning pipeline or remove them

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Dead config confirmed. Fields are only ever defined (src/chat/pruning/constants.ts:36-37 DEFAULT_PRUNING_CONFIG, :44-46 STRATEGY_CONFIGS, types.ts:14,16); zero runtime reads — score.ts:83 hardcodes promote at importance >= 0.6 and prune.ts:42 hardcodes the 0.8*targetTokens floor; strategy's only consumer is the summary string (prune.ts:112-117). Only production call site is generation/auto-gen/context-pruning.ts:68 with default config; STRATEGY_CONFIGS re-exports (pruning/index.ts:17, chat/index.ts:47) are unconsumed. pruning.test.ts:143-159 "respects strategy configs" passes trivially (asserts aggressive.pruned.length >= conservative.pruned.length, true because output is identical). Decide: wire the thresholds into scoreMessage/selectMessagesToPrune, or remove the fields + STRATEGY_CONFIGS and strengthen the test to assert a real behavioral difference.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
