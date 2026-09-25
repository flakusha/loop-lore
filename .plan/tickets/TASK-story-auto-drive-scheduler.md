<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Story Auto-Drive Scheduler

**Status:** open
**Priority:** high
**Effort:** Large (scheduler loop + due-actor selection + dispatch integration + persistence)
**Summary:** World-tick loop that drives the actor autonomy subsystem: due-actor selection, action dispatch through the existing generation pipeline (navigation ticks, BDI decisions, GM beats), pause/resume/step controls, and persistence of simulation state across restarts.
**Context:** Referenced by `epic-actor-autonomy-story-drive.md` Work Item list as `TASK-story-auto-drive-scheduler` (line 70) and Concrete Implementation table row 4 (line 104). Listed as `TBD — needs filing` in the gap-audit (2026-09-23). The scheduler is the orchestration backbone of the autonomy subsystem — without it, the per-actor navigation, BDI reflection, and GM beats have no driver.

**Acceptance Criteria:**
- [ ] World-tick loop with configurable cadence (per-world), respecting the autonomy rate governor.
- [ ] Due-actor selection: deterministic ordering across restarts (sorted by `nextTickAt`), with a documented tie-break rule.
- [ ] Dispatch through existing generation pipeline: `NpcNavigationService`, `BDI reflection cycle`, GM beat scheduling — no greenfield dispatch paths.
- [ ] Pause / resume / step primitives: world admin controls + a CLI surface (`giwt sim pause/resume/step`) for ops.
- [ ] Persistence: simulation state survives restarts (in-progress actor selections, due-time, governor budgets).
- [ ] Telemetry: `scheduler.tick.started`, `scheduler.tick.completed`, `scheduler.dispatch.error` events with the actor/world/payload envelope.
- [ ] Unit + integration tests cover the tick loop, due-actor selection determinism, dispatch integration, and restart persistence.
- [ ] `bun run check` green.

**Epic:** epic-actor-autonomy-story-drive
**Tags:** autonomy, scheduler, world-tick, dispatch, persistence, bdi, gm-beats
**Related:** TASK-autonomy-rate-governor, TASK-autonomy-config-surface, epic-actor-autonomy-story-drive.md:70


git issue: 7ebc1b9
