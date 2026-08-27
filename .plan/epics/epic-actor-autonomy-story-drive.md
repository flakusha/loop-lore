<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Actor Autonomy & Story Auto-Drive

**Status:** Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** autonomy, npc, actors, story-drive, simulation, rate-limiting, scheduler, bdi
**Related:** epic-agency-story-points.md (BDI loop host), epic-npc-navigation.md (movement executor), epic-assistant-gm-flows.md (GM roles + AI director), epic-npcs.md, epic-world-travel-time.md (world clock)

## Summary

Own the **autonomy loop**: the scheduler and governance layer that lets LLM characters,
GMs, and NPCs act, explore, and interact *without a human driving every turn* —
pseudoorganic story development. This epic is the orchestrator and the budget holder;
decision intelligence (BDI, reactions) and action execution (navigation, social, combat)
stay in their host epics.

**Highest-priority principle: rate-limited by default.** Every autonomous action
consumes LLM calls (money, tokens, DB writes). The governor is not a feature of the
loop — it precedes it. No autonomous action path ships ungoverned. An unlimited mode
exists solely for headless stress-testing and is explicitly gated.

## Current State (reviewed 2026-08-25)

- Movement execution exists: `NpcNavigationService` (`src/rpg/npc-navigation/`,
  migration 001/p07) — tick-based movement, code-complete, routes wired, **no caller
  drives ticks autonomously** (`TASK-wire-npc-navigation-routes` pending).
- Decision intelligence planned but deferred: BDI planning loop, reaction system, plan
  revision (`epic-agency-story-points.md` extension, P6+).
- GM orchestration is reactive: `GameMasterService` generates on user turns only;
  `GameMasterConfig.type: llm|human|hybrid` + per-actor model routing exist.
- Group-chat cascade has max-turns / consecutive-turn guards — the only existing
  auto-drive capping, and it is chat-scoped, not world-scoped.
- No world-tick scheduler, no actor turn queue, no autonomy budget, no kill switch,
  no cost accounting for autonomous generations.

## Architecture

```
World clock (tick source: real-time | accelerated | manual)
  └─ Autonomy scheduler (per world/chat)
       ├─ selects due actors (BDI plan due? reaction pending? movement tick due?)
       ├─ asks governor for budget  ←──── HARD GATE, denies by default
       ├─ dispatches action through generation pipeline
       │    (NPC decision → move / chat / interact / GM narrative beat)
       ├─ writes results + episodic memory
       └─ reschedules with cooldown + jitter (pseudoorganic pacing)
```

Key decisions:

1. **Tick source is pluggable** — real-time (background), accelerated (N game-hours per
   real minute), manual (user presses "advance world"); UI never blocks on the loop.
2. **Governor denies by default.** Autonomy is opt-in per world/chat, never ambient.
3. **Jitter is mandatory** — fixed-interval actor actions read as robotic; every
   cooldown gets randomized spread (configurable spread ratio).
4. **Human-in-loop is a mode, not an obstacle** — pause/resume/step-one-action at any
   point; group-cascade guards are reused, not reimplemented.
5. **LLM GM is just another governed actor** — narrative beats consume the same budget;
   hybrid GM (human + LLM suggestions) shares the queue.

## Work Items

- [ ] **Autonomy rate governor** — per-actor action quotas, per-world/chat budgets (actions/hour + token/cost caps), cooldowns with mandatory jitter, cost accounting per actor; kill switch = autonomy-native per-world scope + consumption of generation-flow-control global/per-chat holds (no parallel pause machinery). Unlimited mode only behind explicit dev/stress flag. → TASK-autonomy-rate-governor
- [ ] **Story auto-drive scheduler** — world-tick loop, due-actor selection, action dispatch through existing generation pipeline (navigation ticks, BDI decisions, GM beats), pause/resume/step, persistence of simulation state across restarts. → TASK-story-auto-drive-scheduler
- [ ] **Autonomy config surface** — layering: world default → chat override → per-actor override; pacing presets (serene / organic / brisk); unlimited stress preset gated to dev builds; UI affordances in chat + world settings. → TASK-autonomy-config-surface

## Non-Goals

- Decision intelligence itself (BDI/reactions — `epic-agency-story-points.md`)
- Movement/pathfinding internals (`epic-npc-navigation.md`)
- AI director tension/arc scoring (`epic-assistant-gm-flows.md`)
- HTTP transport rate limiting (auth/middleware — separate subsystem)

## Acceptance Criteria

- [ ] No code path allows an ungoverned autonomous LLM call; governor denial is the default and tested.
- [ ] Unlimited mode requires explicit dev/stress flag; flag off → limits enforced; flag on → every action cost-logged.
- [ ] Scheduler survives restart (simulation state persisted); pause/resume/step verified end-to-end.
- [ ] Pacing presets produce measurably different action cadence (jitter verified).

## Related

Host epics retain their scopes; this epic owns scheduling + governance only.

Generation-level regulation (holds, concurrency semaphore, request-rate limits) lives in
`epic-generation-flow-control.md`: the autonomy scheduler is a governed consumer of those
controls, and the governor stacks actor-level budgets on top — the layers do not reimplement each other.
