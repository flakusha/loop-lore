<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Merge wizard dead-ends at step 1 — selected sources never passed

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: The branch merge wizard opens but dead-ends at step 1: merge-sources-next stays permanently disabled because sources is always [].

ROOT CAUSE: window.openBranchMerge(selectedBranches.map(...)) is dispatched with the two selected tip ids (verified), and the modal opens (.ui.mergeModalOpen === true), but openBranchMerge (src/frontend/alpine/chat-branch-merge.ts:42) writes mergeStep/sources onto the chatState component while the wizard's own x-data (branch-merge-modal.html, inline object with resetWizard()) never reads them — on open it resets and keeps sources: []. canProceedToMode requires sources.length >= 2.

EVIDENCE: Probe: WIZARD: {"mergeModalOpen":true,"step":"sources","sources":[],"error":null}

FIX DIRECTION: Pass the selected sources into the wizard component (or have it read them from the store/chatState on open).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
