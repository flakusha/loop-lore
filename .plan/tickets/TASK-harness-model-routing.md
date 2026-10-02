<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness task-signal model routing

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Route each LLM request to the best model by explicit task signal, not config order. New `src/generation/routing/` policy layer on top of the scheduler; scheduler machinery stays in `epic-llm-request-scheduler.md`.
**Context:** Failover today is provider-ordered with no task discrimination (`providers/registry.ts:181-208 buildFailoverList`, `call-with-failover.ts:29-67`). `resolveModelRole` (`admin/model-roles.ts:53-100`) is a static 4-slot resolver. All 11 `AuxTaskName` types share one Auxiliary model with a 2000ms timeout (`aux-pipeline/runner.ts:51-149`).
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] `src/generation/routing/task-signal.ts` defines `TaskSignal { taskType; contextSize?; estimatedTokens?; requiresCapabilities?; priority?; budgetMs?; budgetTokens? }`; every dispatch call site sets its class explicitly (generate-route → `interactive-turn`, auto-gen → `auto-gen`, aux → per-`AuxTaskName` `toTaskSignal()`, embeddings/rerank → background). No LLM call to classify (deadlock rule).
- [ ] `src/generation/routing/router.ts` implements `ModelRouter.route(signal, models)` → ordered primary + fallbacks with strategies `capability-match | cheapest | fastest | round-robin`, selected via `config.generation.routing { strategy; fallbacks?; rules? }` in `src/config/schema/generation.ts`.
- [ ] `ProviderCapabilities` (`providers/types.ts:14-31`) gains `costPer1kTokens?; avgLatencyMs?; contextWindow?; maxOutputTokens?`; `buildFailoverList` accepts optional `TaskSignal`; `callWithFailover` consumes the router-scored list.
- [ ] Unit tests: strategy ordering, capability filtering, deterministic route for same signal, default route when signal omitted. `bun run check` green incl. 80% per-module floor.

## Related Files

- `src/generation/routing/` (new), `src/generation/providers/registry.ts`, `call-with-failover.ts`, `types.ts`
- `src/config/schema/generation.ts:99-109`, `src/aux-pipeline/runner.ts`, `types.ts`, `src/admin/model-roles.ts`
- `.plan/epics/epic-llm-request-scheduler.md` (scheduler seam this feeds)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
