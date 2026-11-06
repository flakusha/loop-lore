<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: byok-agent-subject-binding

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-agentic-integration-mcp-acp

**Summary:**

Decide + implement whether a facade/integration API key resolves `user_api_keys` for a bound subject user, or is refused BYOK resolution outright. Research findings (2026-11-05 credential pass): an unattributed agent key silently spending a user's stored key would erode the one-person-one-key ToS posture (see `src/integrations/harness/provider-tos.ts:25-28`, `isolation-gate.ts:8-24`); either answer is safe, silence is not. Today the de-facto behavior is refusal: facade admission is fail-closed with no `userId` → 401 ([branch epic-agentic-integration] `src/integrations/loop-lore-facade/authz.ts:28-40`), so an `external-agent` principal (`userId: null`, declared in `src/middleware/types.ts:13` but produced nowhere) can never reach BYOK resolution. If the bound-subject answer wins, wire subject attribution through `authorizeFacadeOp` tier checks and the `userApiKeyResolver` path (`src/generation/providers/user-api-key.ts:78-106`), keeping the fail-closed `ByoKeyDecryptError` behavior (`user-api-key.ts:22-42,92-104`).

**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Acceptance Criteria:**

- [ ] Decision documented: bound-subject resolution vs explicit refusal for agent-key principals
- [ ] Decision enforced in `authorizeFacadeOp` tier checks (fail-closed)
- [ ] No path where an agent credential spends a user's stored key without explicit subject attribution

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
