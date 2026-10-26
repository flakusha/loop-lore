<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Branch merge/delete confirm modals never initialize — dead markup

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue 48922f4): src/components/chat/branch-list-panel.html:12 roots the whole panel in one x-data; merge modal (:93-94 x-show) and delete modal (:129-131 x-show) live inside the Alpine root, so bindings initialize — no dead markup remains.
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: Confirming a branch merge or delete from the branch list panel is impossible: clicking 🗑/↗ updates state but the confirmation modal never becomes visible, so merge and delete via the panel are unreachable UI.

ROOT CAUSE: branch-merge-modal and branch-delete-modal in src/components/chat/branch-list-panel.html carry x-show="mergeFor !== null" / x-show="deleteFor !== null" on elements never processed by Alpine (no _x_dataStack), so the x-show effect never registers and display stays none even after programmatic state writes.

EVIDENCE: Probe output:
DELETE MODAL VISIBLE: false STATE: {"deleteFor":"bf6b373d-...","open":true,"selected":[]}
MODALSCOPE: {"modalCount":1,..."scopeDeleteFor":"bf6b373d-...","display":"none"}
MANUAL SET: {"display":"none","deleteFor":"x","cloak":false,"dataStack":-1}

FIX DIRECTION: Ensure the merge/delete confirm modals are initialized by Alpine (currently dead markup — no _x_dataStack) so their x-show bindings react.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 48922f4 (registry tip: e1bb130a3 Konstantin Fedotov Close issue)
