<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: tui-rpg-stats-panel

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-rpg-mechanics
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

TUI shows RPG stats for the active chat actor. Web reference: src/frontend/alpine/rpg-stats.ts loadRpgStats. Missing: no stats view under src/tui. Acceptance: stat block plus status effects visible; bun test covers mapping.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

Imported from git issue 28b90b9.

git issue: 28b90b9
