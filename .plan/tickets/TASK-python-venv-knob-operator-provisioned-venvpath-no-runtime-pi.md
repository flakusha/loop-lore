<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Python venv knob: operator-provisioned venvPath, no runtime pip install

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Optional spec.venvPath (must exist, contain bin/python); probe against the venv interpreter; operator requirements pre-installed out of band; validateJob rejects runtime pip install; probe reports allowlisted package presence so missing deps surface as unsupported/failed with a name. Depends on bridge core + discovery. Admin status route deferred until a UI consumer exists.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
