<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Scheduler load-soak bench (queued LLM traffic)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Bench the wired ResourceManager under synthetic queued load: N concurrent requests x M priorities, measuring queueWaitMs p50/p95, denial rate, and starvation (low-priority max wait). Runs against MockScenarioProvider (deterministic, default CI-safe) with an opt-in llama-swap variant for real rotation cost. Catches scheduler regressions FEAT-e2e-performance-benchmarks cannot (it measures unqueued paths). Depends on wire ticket; mock variant lands first, llama-swap variant after LLM bench ticket. Epic: epic-llm-request-scheduler.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
