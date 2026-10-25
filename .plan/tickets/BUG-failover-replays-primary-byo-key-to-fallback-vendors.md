<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Failover replays primary BYO key to fallback vendors

**Status:** Done
**Priority:** critical
**Effort:** Medium
**Epic:** epic-byok-api-keys
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Cross-vendor key disclosure: callWithFailover passes same req (same apiKey) to every fallback provider (src/generation/providers/call-with-failover.ts:79-88). User key for provider A sent verbatim to B/C — auth failures + disclosure. Fix: per-attempt resolveProvider or key map Record<providerName,key>. Evidence: provider-request.ts:72 bakes apiKey; handler.ts:178 spreads; scheduler.ts:96 same req.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 248a28b (registry tip: 0f2f862e6 Konstantin Fedotov Close issue)
