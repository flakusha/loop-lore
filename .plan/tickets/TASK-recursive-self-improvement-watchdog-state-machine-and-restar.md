<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Watchdog State Machine + Restart Policy

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** watchdog, state-machine, restart-policy
**Epic:** epic-recursive-self-improvement

State machine that owns the watchdog lifecycle: `starting -> healthy -> degraded -> crashed -> stopping`. Backoff schedule + threshold logic live here. State transitions emit events to `watchdog_events` table + structured logger.

## Core Features

- `WatchdogState` enum: `starting`, `healthy`, `degraded`, `crashed`, `stopping`, `stopped`
- `WatchdogStateMachine` class — owns current state + transitions; emits `state_changed` events
- `BackoffPolicy` — exponential with cap; configurable via `LOOP_LORE_WATCHDOG_BACKOFF` env var
- `CrashWindow` — sliding window of failures within 60s; trigger stop+alert at 5
- Pure functions where possible for testability

## Acceptance Criteria

- [ ] State machine unit-tested for every transition (including invalid transitions)
- [ ] Backoff schedule tested against time-mocked harness
- [ ] CrashWindow test: 5 failures in 60s -> alert; 5 failures over 5min -> no alert
- [ ] State changes emit to `watchdog_events` (lands in #4)
- [ ] No global state; works with multiple watchdog instances in test

## Files

- `src/server/watchdog/state.ts` — new
- `src/server/watchdog/state.test.ts` — new

## Notes / Verification

- Reuse `src/cron/` patterns for sliding-window tracking where applicable.
- Reuse `src/telemetry/` event emission for state-change sink.

