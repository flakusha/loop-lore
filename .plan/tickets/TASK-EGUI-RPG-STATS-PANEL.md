<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui-rpg-stats-panel

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-rpg-mechanics
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

egui shows RPG stats for the active chat actor. Web reference: src/frontend/alpine/rpg-stats.ts loadRpgStats. Missing: no stats view in native/loop-lore-egui. Acceptance: stat block plus status effects visible; rust test covers mapping.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

Imported from git issue 4b3989b.

git issue: 4b3989b
