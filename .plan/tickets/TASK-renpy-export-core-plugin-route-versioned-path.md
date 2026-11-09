<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: RenPy export core plugin route (versioned path)

**Status:** In Progress
**Priority:** high
**Effort:** M
**Epic:** epic-renpy-export
**Tags:** renpy, export, plugin
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Core plugin manifest plugins/core/renpy-export (origin core self-approves) registering POST /api/renpy/export@v1 (versioned `@v1` suffix; the next format ships `@v2` alongside), requiresAuth + caller.userId, db captured from the onLoad context closure, zip via JSZip (game/script.rpy + game/characters.rpy + README.md + game/images/*.png), 50 chat id cap, tests for auth/validation/zip-shape/path-guard.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
