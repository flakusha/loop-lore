<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Failover replays primary BYO key to fallback vendors

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — call-with-failover re-resolves the API key per provider (`resolveApiKey(name)` in src/generation/providers/call-with-failover.ts:87-92), so the primary's BYO key is never replayed to fallback vendors; resolver threaded on every multi-provider dispatch (registry.ts:129-156, provider-request.ts:73, call-llm.ts:170, merge-llm-call.ts:56); scope pinned by src/generation/providers/failover-key-scope.test.ts.
**Priority:** critical
**Effort:** Medium
**Epic:** epic-byok-api-keys
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Cross-vendor key disclosure: callWithFailover passes same req (same apiKey) to every fallback provider (src/generation/providers/call-with-failover.ts:79-88). User key for provider A sent verbatim to B/C — auth failures + disclosure. Fix: per-attempt resolveProvider or key map Record<providerName,key>. Evidence: provider-request.ts:72 bakes apiKey; handler.ts:178 spreads; scheduler.ts:96 same req.

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): call-with-failover re-resolves the API key per provider (`resolveApiKey(name)` in src/generation/providers/call-with-failover.ts:87-92), so the primary's BYO key is never replayed to fallback vendors; resolver threaded on every multi-provider dispatch (registry.ts:129-156, provider-request.ts:73, call-llm.ts:170, merge-llm-call.ts:56); scope pinned by src/generation/providers/failover-key-scope.test.ts.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 248a28b (registry tip: 0f2f862e6 Konstantin Fedotov Close issue)
