<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: One LLM owner decision plus honkbox-native model management

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: operator decision doc, attached-server config, v1 memory plus v1 running admin readout, unload path switch; assertNoDoubleGpuAdmission already enforces at runtime. AC: exactly one scheduler admits GPU per deployment.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
