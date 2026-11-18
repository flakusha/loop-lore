<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: dedicated rerank model role and task signal with aux/general fallback routing

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Rerank resolves its model from env only; no reranking task signal or model role exists, and general is an autoroute scenario rather than a fallback role. Add the role/signal and reuse the existing resolver with env fallback.

**Evidence (dev 2026-11-18):** TaskType has no reranking (src/generation/routing/task-signal.ts:22,50-51); rerank reads RERANK_MODEL and env bases directly and never calls resolveModelRole (src/memory/rerank.ts:66-78); config roles are main/auxiliary/captioning/classifier/translator (packages/core/src/config/schema/generation.ts:135-151); general is an autoroute scenario (generation.ts:107-113); OpenRouter wire bypasses ModelRouter (rerank.ts:73-74).

**Scope:** add a reranking task signal and rerank capability; add an optional rerank role to modelRoles and its config menu; route via resolveModelRole with the existing env chain as fallback; send the OpenRouter wire through the router; keep fail-open when unconfigured.

**Acceptance Criteria:**

- [ ] configured rerank role wins over env fallback
- [ ] legacy env-only setup still works unchanged
- [ ] routing rule on the reranking signal actually fires
- [ ] tests cover role resolution and wire base URL

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
