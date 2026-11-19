<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness provider quota surfaces beyond omp

**Status:** Done
**Priority:** low
**Effort:** Small
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Only the omp adapter resolves non-null quota reports (src/integrations/harness/omp.ts _omp/usage); opencode/codex/claude-code/hermes/openclaw resolve null via the generic engine default (src/integrations/harness/generic-acp.ts:239-245) because their ACP surfaces publish no requestable quota method (documented per-adapter). Usage-ledger config limits still bound every flavor, so dispatch is safe — the gap is provider-reported quota depth in the admin usage surface and breaker inputs. Implement per-flavor quota adapters ONLY when the provider publishes a requestable surface; mirror the omp fetchQuotaReports pattern and extend fake-acp-server with a branch per surface. Do NOT guess wire method names (TASK-acp-profile-harness-adapters caveat).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

Closure was by registry-driven close on 2026-11-12, not a new implementation.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-11-12 registry-driven close: git issue 56a6267 (registry tip: f4ca8761b Konstantin Fedotov Close issue)
