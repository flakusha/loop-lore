<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: tui-world-time-weather-widget

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-weather-environment
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

TUI shows world time plus weather conditions. Web reference: src/frontend/alpine/time-weather.ts and weather-icons.ts. Missing: no time/weather view under src/tui. Acceptance: time of day, weather, season visible with icons; bun test covers icon mapping.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
