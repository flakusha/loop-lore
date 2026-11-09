<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: RenPy export button in chat-list batch bar

**Status:** In Progress
**Priority:** medium
**Effort:** S
**Epic:** epic-renpy-export
**Tags:** renpy, export, ui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Frontend: Ren'Py button in the batch bar (chat-list-panel.html) calling POST /api/renpy/export@v1 with { chatIds: selectedChats } via a new batchExportRenpy() mirroring the batchExport blob download (renpy-export.zip), reusing the existing exportedCount/failedExport/networkErrorExportingChats toasts (no new i18n keys), tests beside chat-management.test.ts (route + payload + download + error); implemented + tested (32 pass in isolation).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
