<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: NPC BDI Autonomy — Character-Level Goal-Pursuit and Between-Session Continuity

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** npc, bdi, autonomy
**Related:** epic-character-internal-traits.md, epic-memory-knowledge-systems.md, epic-time-scale.md, epic-actor-autonomy-story-drive.md

## Summary

Daily BDI (Belief-Desire-Intention) loop turning NPC aspirations into
executable plans, modulated by mood and rolled forward across sessions so an
NPC's life continues while the player is offline. Story-level autonomy lives
in `epic-actor-autonomy-story-drive.md`; this epic owns character-level day-to-day goal pursuit.

## Scope

- BDI runtime: per-NPC scheduler on world events (chat turn, tick, time advance) + between-session catch-up.
- Aspiration consumer: traits from `epic-character-internal-traits.md` as Desire inputs.
- Mood modulation: PAD mood shifts plan priorities and reaction mode.
- Time-scale anchor: plans attached to game-time ticks (`epic-time-scale.md`).
- Between-session persistence + catch-up summary on player return.
- Player-facing NPC life-log view (intentions, recent actions, drift).

## Tasks

- [ ] BDI runtime (`runtime`, `scheduler`, `plan-store`) + deterministic plan selection.
- [ ] Aspiration-as-Desire bridge from internal traits.
- [ ] Mood (PAD) priority-modifier hook.
- [ ] Game-time tick anchor integration.
- [ ] Offline advance + catch-up summary.
- [ ] Life-log UI.
- [ ] Determinism + influence regression tests.

## Acceptance Criteria

- [ ] 100 NPCs plan in < 1s p95.
- [ ] Aspirations measurably change plan priorities (regression test).
- [ ] Mood measurably changes reaction modes (regression test).
- [ ] Game-time advance triggers BDI tick; plans anchored to game-time.
- [ ] State survives 7 simulated days; catch-up cites >= 3 events.
- [ ] Life log inspectable per NPC; updates within 100ms of tick.

## Linked Tickets

| # | Ticket |
| - | ------ |
| 1 | `TASK-npc-bdi-planning.md` |
| 2 | `TASK-character-mood-happiness.md` |
| 3 | `TASK-living-world-persistence.md` |
| 4 | `TASK-matrix-cross-mech-g18-agentic-npc-autonomy.md` |
| 5 | `TASK-npc-social-conversation.md` |
| 6 | `TASK-npc-social-decision.md` |
| 7 | `TASK-npc-social-dynamics.md` |
| 8 | `TASK-npc-social-memory.md` |
| 9 | `TASK-npc-planning-loop.md` |
| 10 | `TASK-npc-plan-revision.md` |
| 11 | `IDEA-epic-npc-to-npc-social-2026-09-26.md` |
| 12 | `FEAT-2026-028.md` |
