<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: RenPy export script generator (pure function)

**Status:** Not Started
**Priority:** high
**Effort:** M
**Epic:** epic-renpy-export
**Tags:** renpy, export, plugin
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Pure .rpy text builder in plugins/core/renpy-export: normalized export model (chat, played-path messages, fork stubs, character table) to game/script.rpy text with define/label/say/menu blocks, slug + escape helpers, full bun:test coverage of labels, dialogue, menus, stub labels, and escaping.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
