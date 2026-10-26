<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Memory panel never renders memories in any chat — response envelope mismatch

**Status:** Done
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: The memory panel always shows zero memories even when the API returns them; all memory-row interactions (edit/pin/approve/reject/delete) are unreachable because rows never render.

ROOT CAUSE: Panel parser loadMemories (src/frontend/alpine/memory-panel-core.ts:43) reads `data.items`, but GET /api/v1/actors/:id/memories returns an envelope keyed `data` (`{"data":[...persisted rows...]}`), so items is always [].

EVIDENCE: Probe: DIRECT API answers 200 {"data":[{..."scope":"character"...}]} while panel STATE shows characterMemories:[]. Failing-run tail before tests were skipped:
TimeoutError: waitFor ... getByText('mem-seeded-...') to be visible — 0 pass, 7 fail across the memory CRUD suite.

FIX DIRECTION: Return { items, total } from the actor-memories list route (or read body.data in loadMemories).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 46fcedc (registry tip: 7cfdfb954 Konstantin Fedotov Close issue)
