<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui-battle-display-panel

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-battle-ui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

egui shows battle state: turn order, health, skill checks. Web reference: src/frontend/battle panel.ts render.ts health-bar.ts turn-order.ts commands.ts. Missing: no battle view in native/loop-lore-egui. Acceptance: turn order plus health visible; rust test covers rendering.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

Imported from git issue 532dd0e.

git issue: 532dd0e
