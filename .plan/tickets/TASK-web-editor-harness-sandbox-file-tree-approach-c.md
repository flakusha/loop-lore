<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Web editor: harness sandbox file tree (approach C)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-browser-editor-support
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Epic: epic-browser-editor-support. GET /api/v1/harness/runs/:id/files read-only tree chrooted to sandbox root via new isWithin helper (reject dotdot, escaping symlinks, absolute paths). Browser tree view, click opens via A/B, plus open-sandbox-in-editor button. Full context in tree/web-editor-term/.plan/epics/epic-browser-editor-support.md section C.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
