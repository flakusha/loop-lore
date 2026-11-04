<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Per-session cost meter (user-visible, complements cost estimator)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Tags:** cost, telemetry, research-gap
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Research 01 gap 5 + 06 finding: FEA-2026-056 dashboard is admin-side; TASK-llm-cost-tokenizer-plus-estimator (Not Started, epic-llm-queue) covers pre-call estimate + routing. Gap: user-visible per-chat spend meter surfaced in chat UI (local-first + distributed-compute economics are the existential signal). Wire existing telemetry into a visible meter; do not duplicate the estimator ticket. Research: .tmp/research/ai-cheat/01-outside-takes.md gap 5, 06-observability-sandbox.md cost section. Merged from dupe TASK-per-session-cost-meter-from-telemetry (503fb92, closed): render in chat header; companion-market unit-economics signal.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
