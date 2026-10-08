<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Route plugin calls through the shared provider path

**Status:** Not Started
**Priority:** high
**Epic:** epic-llm-request-scheduler
**Effort:** Medium

**Summary:**

**Problem.** Direct `provider.complete()` callsites bypass the scheduler, failover, circuit breaker, and exec log. The abstraction, failover, and breaker all exist and are centralized — roughly a dozen callsites simply do not go through them, so retries, provider failover, breaker state, and the run log are silently absent on those paths.

**Evidence.** Count re-derived against current source (the research disagreed with itself: 9 in one doc, 13 in another, 12 files; the numbers below are from a fresh `grep -rn 'provider.complete(' src/` excluding tests). **13 callsites across 12 files:**
- `src/assistant/commands/create.ts:257`
- `src/assistant/commands/regen.ts:100`
- `src/assistant/commands/rewrite.ts:193`
- `src/assistant/commands/summarize.ts:147`
- `src/assistant/commands/translate.ts:153` and `:171` (2 callsites, one file)
- `src/chat/auto-translate.ts:158`
- `src/generation/caption-route.ts:167`
- `src/generation/auto-gen/story-mode.ts:89`
- `src/routes/generation/compare.ts:177`
- `src/routes/story-orchestration/helpers.ts:132`
- `src/routes/vn-generate/choices.ts:96`
- `src/routes/vn-generate/story.ts:89`

For contrast, the compliant path is `src/generation/providers/call-with-failover.ts:88`, which calls `prov.complete(req)` *and* records breaker state (`:90` `circuitBreaker.onSuccess`) and the run (`:91` `logRun`) — the three things the bypasses skip. Centralized layers already in place: `circuit-breaker.ts` (singleton at `:191`), `call-with-failover.ts:35`, `providers/retry.ts`.

Note the bypass pattern in the assistant commands: they resolve a provider, then hand `(req) => resolved.provider.complete(req)` down as a callback — so the fix is to hand down `callWithFailover` instead, not to rewrite each handler.

**Impact.** A provider outage degrades differently depending on which surface the user happened to hit: retry and failover on the shared path, a raw failure on these 12. Breaker state is also wrong — traffic that bypasses the breaker never marks a provider unhealthy, so it cannot be avoided by the paths that do use it.

**Fix direction.** Route every one of the 13 through `callWithFailover` so scheduler, failover, breaker, and exec log are unconditional. This is also the precondition for the provider-rerouting seam: a plugin seam at the provider egress point means nothing while a dozen callsites bypass the egress point entirely.

**Verification.** `grep -rn 'provider.complete(' src/ --include=*.ts` outside `src/generation/providers/` and tests returns zero hits.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
