<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness provider quota surfaces beyond omp

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Only the omp adapter resolves non-null quota reports (src/integrations/harness/omp.ts _omp/usage); opencode/codex/claude-code/hermes/openclaw resolve null via the generic engine default (src/integrations/harness/generic-acp.ts:239-245) because their ACP surfaces publish no requestable quota method (documented per-adapter). Usage-ledger config limits still bound every flavor, so dispatch is safe — the gap is provider-reported quota depth in the admin usage surface and breaker inputs. Implement per-flavor quota adapters ONLY when the provider publishes a requestable surface; mirror the omp fetchQuotaReports pattern and extend fake-acp-server with a branch per surface. Do NOT guess wire method names (TASK-acp-profile-harness-adapters caveat).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
