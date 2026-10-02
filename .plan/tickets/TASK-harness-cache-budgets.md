<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness LLM cache + dedup + cost budgets

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Generation-response cache + per-user/chat spend tracking + fleet ceiling. Direct cost control: agent fleets pay N× for repeated prompts with no ceiling today.
**Context:** No response cache exists (`dedupe|responseCache|promptCache|cacheKey` hits are idempotency keys, LoRA TTL, memory-write dedup only). Trimming (`prompt-budget.ts:61 dropOverBudgetSections`) + scheduling (`llm/` PriorityQueue) exist but no spend tracking (`compare.ts:33` hardcodes `COST_PER_1K_TOKENS = 0.002`; agency ledger is game points, not money). hermes `CanonicalUsage` + sub-cent labels is the usage shape.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Response cache keyed by (model, normalized prompt, params) with TTL + explicit bust on template/config change; hit/miss recorded as `harness.call_completed` with `savedTokens`.
- [ ] Dedup: concurrent identical in-flight requests coalesce to one call (single-flight per cache key).
- [ ] Per-user/chat spend tracking replaces the hardcoded blended rate with route-attributed cost (`CanonicalUsage`-shaped usage rows); fleet/global ceiling + per-actor caps enforced in the scheduler admission path (governor owns the numbers).
- [ ] Unit tests: key normalization, TTL/bust, single-flight coalescing, cap enforcement. Cache OFF by default for interactive turns until measured safe (stale-persona risk).

## Related Files

- `src/generation/` (cache lives at the egress seam), `src/llm/resource-manager.ts` (admission), `src/autonomy/governor/` (caps)
- `src/chat/prompt-budget.ts`, `compare.ts:33`, `src/telemetry/service.ts` (savedTokens event)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
