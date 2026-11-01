<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: tui-i18n-locale-wiring

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-i18n
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

TUI renders locale strings via the shared i18n catalog. Web reference: src/frontend/alpine/i18n.ts. Missing: zero i18n or locale handling under src/tui. Acceptance: locale-selected strings on main surfaces; bun test covers switching. TUI translate controls already covered by TASK-tui-read-mostly-annotations-plus-auto-translate-controls; this is catalog wiring.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
