<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: LLM generation bench via local llama-swap (opt-in)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-llm-request-scheduler

**Summary:**

Opt-in bench in tests/benchmarks/ using local llama-swap + llama-server binaries (present on dev host). Measures LLM round-trip p50/p95/p99, token rate, and model-rotation cost. Default-off (LL_BENCH_LLM=1), graceful skip when binaries/models missing, same posture as real-generation.test.ts. Results feed epic-llm-request-scheduler admission tuning (slot caps, rotation policy) and epic-performance-dashboard-slo LLM panel (p95<5s, >20 tok/s). Depends on TASK-wire-llm-resource-manager-into-generation-dispatch for queue-wait attribution; standalone latency numbers land first. Epic: epic-llm-request-scheduler.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
