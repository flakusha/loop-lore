<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Story Auto-Drive Scheduler

**Status:** Not Started
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
