<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: RenPy export core plugin route (versioned path)

**Status:** Not Started
**Priority:** high
**Effort:** M
**Epic:** epic-renpy-export
**Tags:** renpy, export, plugin
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Core plugin manifest plugins/core/renpy-export (origin core self-approves) registering POST /api/v1/renpy-export (versioned path so the elysia catch-all dispatch reaches it; unversioned /api/renpy/export 308-redirects and misses), requiresAuth + caller.userId for ownership, db captured from onLoad context closure, ZIP via existing JSZip/finalizeExportZip pattern (game/script.rpy + game/characters.rpy + game/images + README.md), 20 chat id cap, regression test that /api/v1/renpy/export is reachable and unowned chats are excluded.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
