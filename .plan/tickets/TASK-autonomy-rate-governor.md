<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Autonomy Rate Governor (per-agent/user budget caps)

**Status:** open
**Priority:** high
**Effort:** Medium (budget tracker + UI + telemetry hooks)
**Summary:** Per-agent and per-user budget caps on autonomy actions — the rate-limiting layer that prevents runaway autonomy ticks from draining generation quota or flooding the chat timeline.
**Context:** Referenced by `epic-actor-autonomy-story-drive.md` Work Item list as `TASK-autonomy-rate-governor` and Concrete Implementation table row 7 (line 107). Listed as `TBD — needs filing` in the gap-audit (2026-09-23). The governor is a hard requirement of the autonomy subsystem: every `NpcNavigationService` tick and every story auto-drive scheduler beat must check budget before dispatching.

**Acceptance Criteria:**
- [ ] Budget tracker with per-agent + per-user dimensions, persisted across restarts.
- [ ] Configurable limits: per-tick action count, per-minute generation calls, per-hour beat dispatches.
- [ ] Telemetry hooks: emit a `governor.budget.exceeded` event when a limit trips, with the agent/user/limit/timestamp payload.
- [ ] UI surfacing in world settings + chat settings: budget remaining + reset window.
- [ ] The story auto-drive scheduler respects the governor at every beat (no bypass paths).
- [ ] Unit tests cover: budget tracking, limit-trip events, persistence across restarts, and the bypass-resistance assertion.
- [ ] `bun run check` green.

**Epic:** epic-actor-autonomy-story-drive
**Tags:** autonomy, rate-limiting, budget, governor, telemetry, per-agent, per-user
**Related:** TASK-autonomy-config-surface, TASK-story-auto-drive-scheduler, epic-actor-autonomy-story-drive.md:70-72


git issue: 44dc2a8
