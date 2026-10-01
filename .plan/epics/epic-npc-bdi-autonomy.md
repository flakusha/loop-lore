<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Character-Level Goal-Pursuit & Between-Session Continuity

**Status:** Not Started
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** npc-autonomy, bdi, generative-agents, cross-cutting
**Related:** epic-character-internal-traits.md, epic-memory-knowledge-systems.md, epic-time-scale.md, epic-actor-autonomy-story-drive.md, epic-npc-management-ui.md, epic-npc-to-npc-social.md
**Overview:** A daily BDI (Belief-Desire-Intention) goal-pursuit loop for NPCs at character level, closing matrix gaps G27/G28/G32. Unifies three disconnected systems — aspirations from `epic-character-internal-traits.md`, mood from `TASK-character-mood-happiness.md`, and BDI planning from `TASK-npc-bdi-planning.md` — into one scheduler that turns aspirations into executable plans, modulates them by mood, anchors them to game-time ticks, and advances them between sessions so NPC lives continue while the player is offline.

## Summary

A daily BDI (Belief-Desire-Intention) loop that turns NPC aspirations into executable plans, modulated by mood and rolled forward across sessions so an NPC's life continues even when the player is offline. Aspirations drive plan priorities; mood shifts plan type and reaction mode; world events interrupt plans; between-session catch-up summary communicates drift to the player.

## Scope

1. **BDI runtime** — a per-NPC scheduler that runs (a) on every relevant world event (chat turn, world tick, time advance) and (b) between sessions for "the world continues without you" behavior. Bids on goals → selects intentions → enacts plan steps.
2. **Aspiration-driven planning** — `epic-character-internal-traits.md` defines aspirations as structured data. This epic consumes them as Desire inputs.
3. **Mood modulation** — mood is modeled as PAD (Pleasure-Arousal-Dominance). Mood shifts plan priorities (e.g. low-arousal NPC picks rest over adventure) and reaction mode (sad NPC deflects vs engages).
4. **Time-scale integration** — `epic-time-scale.md` advances game time; BDI plans are anchored to game-time ticks so a 3-day plan in-world means 3 days, not 3 turns.
5. **Between-session persistence** — NPC schedules advance offline. On player return, a "catch-up" message summarizes what happened.
6. **Player-facing surface** — a per-NPC "life log" view that shows current intentions, recent actions, and drift over time.

## Work Items

- [ ] BDI runtime (`src/npc/bdi/{runtime,scheduler,plan-store}.ts`)
- [ ] Aspiration consumer (trait-as-Desire bridge)
- [ ] Mood modulation hook (PAD-as-priority-modifier)
- [ ] Time-scale integration (game-time tick anchor)
- [ ] Between-session persistence + catch-up summary
- [ ] NPC life-log UI
- [ ] Tests for BDI determinism (same inputs → same plan)

## Acceptance Criteria

- [ ] BDI runtime produces plans for 100 NPCs in < 1s p95
- [ ] Aspirations measurably influence plan priorities (regression test: aspiration Y vs Z produces different plans)
- [ ] Mood shifts measurably change reaction modes (regression test: low-arousal NPC rejects high-arousal plans)
- [ ] Game-time advance triggers BDI tick; plans anchored to game-time, not wall-clock
- [ ] Between-session persistence: NPC state survives 7 simulated in-world days; catch-up summary mentions ≥ 3 events
- [ ] Player can inspect any NPC's life log; UI updates within 100ms of BDI tick

## Rationale

The matrix audit (G27, G28, G32) identifies three gaps that all stem from one missing system: a **BDI loop that integrates aspirations + mood + persistence**. Three orphan tickets (`TASK-npc-bdi-planning.md`, `TASK-character-mood-happiness.md`, `TASK-living-world-persistence.md`) are already filed but each assumes the other exists. Without an epic to anchor them:

1. **Aspirations are aspirational, not actionable** — `epic-character-internal-traits.md` defines them, but nothing turns them into plans.
2. **Mood is a UI number** — it is measured, but nothing acts on it.
3. **Persistence is a wish** — the runtime doesn't exist.

Generative-agents (Stanford), Inworld AI, and Convai all ship BDI-style loops in production. The pattern is mature; loop-lore has the prerequisites (traits, mood, memory, time-scale) but not the integration.

This epic also closes matrix gaps G29 (NPC-to-NPC social), G30 (memory for social topics), G33 (relationship drift) — all of which need a BDI runtime to ask "what does this NPC want right now?"

## Open Questions

1. **LLM-as-BDI** — should BDI reasoning be LLM-driven (one LLM call per NPC per tick) or rule-driven (deterministic utility functions)? LLM is more expressive but expensive; rule-based is fast but rigid. Generative-agents use LLM reflection; Inworld uses hybrid.
2. **Multi-NPC coordination** — when two NPCs want the same resource, do they negotiate (LLM-mediated) or compete (rule-mediated)?
3. **Player intervention** — can the player override an NPC's current intention? If yes, what's the surface (admin panel, in-character speech, GM only)?
4. **World event priority** — when an in-character crisis (battle, romance, betrayal) interrupts an NPC's plan, does BDI automatically adapt or require player / GM intervention?
5. **Determinism vs surprise** — generative-agents explicitly values surprise; loop-lore's RPG-flavored product may value determinism. Where on this axis does the epic land?
6. **Cost** — BDI ticks for 100 NPCs at LLM cost are nontrivial. Should BDI be opt-in per NPC (paid feature) or always-on (operator-billed)?

## Dependencies

- `epic-character-internal-traits.md` — aspirations (Desire source), moral disposition (drives Desire selection)
- `epic-character-growth.md` — character growth (long-term Desire evolution)
- `epic-memory-knowledge-systems.md` — episodic memory (Belief source)
- `epic-time-scale.md` — game-time tick anchor
- `epic-actor-autonomy-story-drive.md` — story-level autonomy (sibling; player-facing)
- `epic-npc-management-ui.md` — UI surface for life log
- `epic-npc-to-npc-social.md` — consumer (NPCs talk to each other using BDI state)
