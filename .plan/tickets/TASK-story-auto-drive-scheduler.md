<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Story Auto-Drive Scheduler

**Status:** In Progress
**Priority:** high
**Effort:** Large (scheduler loop + due-actor selection + dispatch integration + persistence)
**Summary:** World-tick loop that drives the actor autonomy subsystem: due-actor selection, action dispatch through the existing generation pipeline (navigation ticks, BDI decisions, GM beats), pause/resume/step controls, and persistence of simulation state across restarts.
**Context:** Referenced by `epic-actor-autonomy-story-drive.md` Work Item list as `TASK-story-auto-drive-scheduler` (line 70) and Concrete Implementation table row 4 (line 104). Listed as `TBD — needs filing` in the gap-audit (2026-09-23). The scheduler is the orchestration backbone of the autonomy subsystem — without it, the per-actor navigation, BDI reflection, and GM beats have no driver.

**Acceptance Criteria:**
- [x] World-tick loop with configurable cadence (per-world), respecting the autonomy rate governor.
- [x] Due-actor selection: deterministic ordering across restarts (sorted by `nextTickAt`), with a documented tie-break rule.
- [ ] Dispatch through existing generation pipeline: `NpcNavigationService`, `BDI reflection cycle`, GM beat scheduling — no greenfield dispatch paths.
- [ ] Pause / resume / step primitives: world admin controls + a CLI surface (`giwt sim pause/resume/step`) for ops.
- [x] Persistence: the per-world cursor, pause flag, tick count, last error, and governor budgets survive restarts.
- [x] Telemetry: `scheduler.world_tick.started` / `.completed` / `.error` events with the world + payload envelope.
- [x] Unit + integration tests cover the tick loop, due-actor selection determinism, dispatch integration, and restart persistence.
- [x] `bun run check` green.

**Epic:** epic-actor-autonomy-story-drive
**Tags:** autonomy, scheduler, world-tick, dispatch, persistence, bdi, gm-beats
**Related:** TASK-autonomy-rate-governor, TASK-autonomy-config-surface, epic-actor-autonomy-story-drive.md:70

## Implementation Notes

Shipped in `src/autonomy/scheduler/` — `AutonomyScheduler` is the
orchestrator; the class owns the loop and delegates every beat.

- Loop: `tickOnce(nowMs)` selects due worlds and dispatches one tick each.
  There is no `setInterval` inside the class — the caller (cron job) decides
  the poll cadence, so the loop is testable by passing a clock.
- Due selection: `world_simulation_state` rows where
  `next_tick_at <= now AND paused = 0`, ordered `(next_tick_at ASC,
  world_id ASC)`. `world_id` is the documented tie-break, so two worlds due
  at the same instant always dispatch in the same order — across restarts
  too, since the order lives in the query, not in memory.
- A world with no row at all is treated as due (epoch cursor, not paused),
  so autonomy does not need an opt-in seed row per world.
- Persistence: the cursor write is the commit point. A crash mid-tick
  replays at most one world tick; pause flags, cursors, and tick counts all
  survive a restart. `paused` is always part of the write so a concurrent
  admin pause is not lost when a tick lands.
- Error isolation: a throwing world records `last_error` (truncated) and
  backs off, while healthy worlds keep ticking. One bad world cannot stall
  the loop.
- Telemetry: `scheduler.world_tick.started` / `.completed` / `.error`,
  fire-and-forget — a telemetry outage must never stall the tick it
  describes.
- Cadence: per-world, from the resolved `AutonomyConfig`
  (`tickIntervalMs` + `jitterRatio`), so the config surface tunes the loop
  without a scheduler change.

### Remaining (why this is In Progress, not Done)

Two criteria are deliberately open rather than half-shipped:

1. **BDI reflection + GM beat dispatch.** The loop selects and dispatches
   navigation ticks today. `BDI reflection cycle` and `GM narrative beat`
   dispatch land with `epic-agency-story-points` (the decision layer) and
   the GM actor work — wiring them now would mean inventing a dispatch path
   for a decision layer that does not exist yet, which is exactly the
   greenfield path the criterion forbids. The scheduler's per-world tick
   hook is the seam they plug into.
2. **CLI surface.** `pause` / `resume` / `stepOnce` are implemented and
   tested on the class. The `giwt sim pause/resume/step` command would
   live in `giwt` — an **external git dependency**
   (`package.json`: `github:flakusha/giwt`), not in this repo. It would
   also have to reach into loop-lore's `world_simulation_state` table,
   coupling a worktree-management CLI to the app's schema. That is a
   cross-repo change and is filed as a follow-up rather than attempted
   here. An in-app HTTP admin route for the same three operations is the
   lower-friction alternative and needs no new repository.

## Design Notes (merged from the prior world-tick-and-actor-turns ticket variant)

Current state: `NpcNavigationService` (src/rpg/npc-navigation/) is tick-based but nothing drives ticks. `GameMasterService` generates only on user turns; `GameMasterConfig.type` llm/human/hybrid + actorModels per-actor routing exist. BDI planning/reaction tickets (epic-agency-story-points) are the decision layer — accommodate when they land, do not wait.

Direction:
1. Tick source pluggable: real-time (background interval), accelerated (N game-hours per real minute), manual (advance-world affordance); per world/chat. UI never blocks on the loop.
2. Due-actor selection each tick: BDI plan due, pending reaction, movement tick due, GM narrative beat due (LLM GM = governed actor consuming the same budget).
3. Dispatch through the existing generation pipeline (story-mode/auto-gen path, group-cascade turn guards reused); results + episodic memory writes.
4. Human-in-loop: pause/resume/step-one-action at any moment; user messages always pre-empt autonomous turns.
5. Persistence: simulation state (tick cursor, actor queues, pending reactions) survives restart; crash recovery resumes without double-dispatch.
6. v1 autonomy vocabulary: move (navigation ticks), ambient action (BDI plan or simple idle), initiate/react chat, GM beat. Exploration = movement + location-event reactions.
7. Governor integration: due actor without budget is skipped and rescheduled, not dropped.


git issue: 7ebc1b9
