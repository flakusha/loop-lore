<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: dedicated rerank model role and task signal with aux/general fallback routing

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Rerank now resolves its model through `resolveModelRole` with the existing env chain as fallback, a `reranking` task signal exists, and `general` remains an autoroute scenario fallback rather than a model role. The filed premise (env-only resolution, no task signal, no role) was stale.

**Evidence (dev 2026-11-22):** rerank resolves via `resolveModelRole` with the env fallback chain (`src/memory/rerank.ts:66-78`); the `reranking` task signal is declared (`src/generation/routing/task-signal.ts:22,54-56`); coverage in `src/memory/rerank.test.ts` and `src/generation/routing/task-signal.test.ts`.

**Scope:** add a reranking task signal and rerank capability; add an optional rerank role to modelRoles and its config menu; route via resolveModelRole with the existing env chain as fallback; send the OpenRouter wire through the router; keep fail-open when unconfigured.

**Acceptance Criteria:**

- [x] configured rerank role wins over env fallback (`src/memory/rerank.ts:66-78`)
- [x] legacy env-only setup still works unchanged (env chain kept as the fallback path)
- [x] routing rule on the reranking signal actually fires (`src/generation/routing/task-signal.ts:22,54-56`)
- [x] tests cover role resolution and wire base URL (`src/memory/rerank.test.ts`, `src/generation/routing/task-signal.test.ts`)

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Resolved:** 2026-11-19 registry-driven close: git issue d195a7c (registry tip: cddea4137 Konstantin Fedotov Close issue)
