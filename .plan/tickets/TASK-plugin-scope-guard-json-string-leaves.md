<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Plugin scope guard JSON-string leaves

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-plugin-system
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

walkStringLeaves stops at string leaves, so a JSON string passed as a tool argument is treated as one opaque value and its nested path fields are never inspected. Decide whether to parse JSON-valued leaves inside assertParamsWithinScope (bounded, with a truncation verdict), then add an import edge and a test that a path inside a JSON string cannot escape the worktree root. [INFERENCE] from the live guard.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
