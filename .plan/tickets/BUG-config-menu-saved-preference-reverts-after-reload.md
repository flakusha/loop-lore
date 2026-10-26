<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Config-menu saved preference reverts after reload

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: Saving a config-menu preference (e.g. registration_open=false) shows the 'Saved' indicator and PATCH /api/config-menu returns 200 with the correct body, but after page.reload() the catalog reports the old value again — the preference does not survive reload.

ROOT CAUSE (suspected, not fully root-caused): the read-back path appears to ignore system_config writes — suspected in-memory snapshot vs DB read-back divergence.

EVIDENCE: Probe: {"before":true,"afterClick":false,"patchStatus":200,"patchBody":"{\"key\":\"registration_open\",\"value\":false}","field":"registration_open","finalState":true}

FIX DIRECTION: Root-cause the read-back path for config-menu preferences and make GET/reload serve the persisted value.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 8387b00 (registry tip: 6649324fc Konstantin Fedotov Close issue)
