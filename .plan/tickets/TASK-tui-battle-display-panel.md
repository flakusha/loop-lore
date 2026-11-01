<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: tui-battle-display-panel

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-battle-ui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

TUI shows battle state: turn order, health, skill checks. Web reference: src/frontend/battle panel.ts render.ts health-bar.ts turn-order.ts commands.ts. Missing: no battle view under src/tui. Acceptance: turn order plus health visible; bun test covers rendering.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
