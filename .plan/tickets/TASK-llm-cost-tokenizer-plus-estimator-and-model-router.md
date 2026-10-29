<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: LLM cost tokenizer plus estimator and model router

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-llm-queue
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-llm-queue.md (also scheduler, byok-api-keys, performance-dashboard-slo). Slices: src/chat/tokenizer.ts tiktoken wrapper, src/llm/cost-estimator.ts pre-call estimate, src/llm/model-router.ts cost-aware routing, per-feature cost_usd telemetry plus budget alerts. Defer batch-API and semantic cache until hit-rate proven. Caveats: estimator drift vs actuals, budget race under concurrency, alert fatigue.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
