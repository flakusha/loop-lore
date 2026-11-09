<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: RenPy export button in chat-list batch bar

**Status:** Not Started
**Priority:** medium
**Effort:** S
**Epic:** epic-renpy-export
**Tags:** renpy, export, ui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Frontend: batch-bar button in src/components/chat/chat-list-panel.html calling POST /api/v1/renpy/export with selectedChats (mirroring batchExport blob download as renpy-export.zip), toast + i18n keys, unit coverage beside chat-management.test.ts; explicit out of scope: no in-RenPy editing inside loop-lore, no vn_choices menu mapping in v1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
