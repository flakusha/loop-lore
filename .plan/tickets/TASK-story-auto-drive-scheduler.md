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
- [ ] Dispatch through existing generation pipeline: `NpcNavigationService`, `BDI reflection cycle`, GM beat scheduling — no greenfield dispatch paths. (`NpcNavigationService` ships; the other two wait on the decision layer.)
- [x] Pause / resume / step primitives: world admin controls land as `POST /api/worlds/:worldId/autonomy/control` on the shared panel. The `giwt sim` CLI is a cross-repo change — see Remaining.
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

One criterion is deliberately open rather than half-shipped.

**BDI reflection dispatch.** An earlier revision of this note claimed the
BDI reflection cycle "does not exist yet". That was wrong: the plumbing is
real — `runNightlyReflectionCycle` (`src/services/agency/bdi-nightly.ts`)
and `applyReflectionCheckpoint` (`src/services/agency/bdi-reflection.ts`)
are implemented against migration 011's tables and covered by tests. What
does not exist is the **decision function**: `planRecompute`, the injected
callback that decides what an actor actually wants to do tonight, has no
implementation anywhere in `src/`. Its only implementations are the literal
fixtures inside `bdi-nightly.test.ts`.

So the cycle is a shell: supply a `planRecompute` and a `budgetApprove`
(the latter is a one-liner over `AutonomyGovernor`) and it works. Supplying
`planRecompute` *is* the decision-layer work this epic's Non-Goals assign to
`epic-agency-story-points.md`, and shipping a hardcoded planner to close the
checkbox would be exactly the greenfield path the criterion forbids.
`budgetApprove` was deliberately left unwired too — gating a cycle that
cannot run is dead code.

**GM beat dispatch.** Genuinely absent. `GameMasterService`
(`src/story/game-master/index.ts`) is chat-scoped: it needs `(db, chatId,
gmConfig, generateText)` and produces a turn, not a world-scoped beat. No
unit in `src/` generates a narrative beat for a world. The nearest thing,
`createSteering` (`src/story/timeline/event-steering.ts`), is a
GM-authored future-event teaser store that generates no text and has no
callers outside its own test. Building a world-scoped beat producer is the
`epic-assistant-gm-flows` AI-director work, again out of scope here.

The scheduler's per-world tick hook is the seam both plug into.

The admin half of the pause/resume/step criterion did land, as
`POST /api/worlds/:worldId/autonomy/control` (`pause` / `resume` / `step`),
served by the shared autonomy panel on the world settings page. The
`giwt sim` CLI half stays open: `giwt` is an **external git dependency**
(`package.json`: `github:flakusha/giwt`), and the command would have to reach
into loop-lore's `world_simulation_state` table — coupling a worktree
management CLI to this app's schema. Cross-repo change; not attempted here.

## Design Notes (merged from the prior world-tick-and-actor-turns ticket variant)

Current state (as first written): `NpcNavigationService` (src/rpg/npc-navigation/) is tick-based but nothing drives ticks. `GameMasterService` generates only on user turns; `GameMasterConfig.type` llm/human/hybrid + actorModels per-actor routing exist. BDI planning/reaction tickets (epic-agency-story-points) are the decision layer — accommodate when they land, do not wait.

Direction:
1. Tick source pluggable: real-time (background interval), accelerated (N game-hours per real minute), manual (advance-world affordance); per world/chat. UI never blocks on the loop.
2. Due-actor selection each tick: BDI plan due, pending reaction, movement tick due, GM narrative beat due (LLM GM = governed actor consuming the same budget).
3. Dispatch through the existing generation pipeline (story-mode/auto-gen path, group-cascade turn guards reused); results + episodic memory writes.
4. Human-in-loop: pause/resume/step-one-action at any moment; user messages always pre-empt autonomous turns.
5. Persistence: simulation state (tick cursor, actor queues, pending reactions) survives restart; crash recovery resumes without double-dispatch.
6. v1 autonomy vocabulary: move (navigation ticks), ambient action (BDI plan or simple idle), initiate/react chat, GM beat. Exploration = movement + location-event reactions.
7. Governor integration: due actor without budget is skipped and rescheduled, not dropped.


git issue: 7ebc1b9
