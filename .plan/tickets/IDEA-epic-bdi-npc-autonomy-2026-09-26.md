<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA-epic-bdi-npc-autonomy-2026-09-26: NPC BDI Goal-Pursuit Loop (matrix gaps G27/G28/G32)

**Status:** Not Started
**Priority:** medium (P6+ per matrix, but 🔴 High future severity)
**Effort:** Large
**Type:** Research
**Summary:** Matrix gaps G27, G28, G32 all describe the same root: no **BDI (Belief-Desire-Intention) goal-pursuit loop** for NPCs. Aspirations (from `epic-character-internal-traits.md`), mood (from `TASK-character-mood-happiness.md`), and BDI planning (`TASK-npc-bdi-planning.md`) exist as **disconnected systems** — no epic unifies them into a daily-plan execution loop. Inspiration: Inworld AI, Convai, generative-agents. Existing `epic-actor-autonomy-story-drive.md` covers story-level autonomy; this proposal covers **character-level** day-to-day goal pursuit.
**Context:** Source row: 2026-09-26 epic audit; matrix reference: `matrix-cross-mechanics.md` G27, G28, G32 (2026-08-14 research sweep). The matrix documents that BDI planning needs aspiration data, mood data, and between-session persistence — none of which are currently wired. Three related tickets exist as orphaned stubs (`TASK-npc-bdi-planning.md`, `TASK-character-mood-happiness.md`, `TASK-living-world-persistence.md`); no epic owns the integration.

## Suggested epic description

### Title

`epic-npc-bdi-autonomy.md` — Character-Level Goal-Pursuit & Between-Session Continuity

### Status / Priority / Effort / Type

- Status: Not Started
- Priority: Medium (matrix 🟡 Medium severity; P6+ deferred under 0.1.0)
- Effort: Large (BDI runtime + scheduler + integration with traits/mood/memory/time)
- Type: Feature Epic

### Summary

A daily BDI (Belief-Desire-Intention) loop that turns NPC aspirations into executable plans, modulated by mood and rolled forward across sessions so an NPC's life continues even when the player is offline. Aspirations drive plan priorities; mood shifts plan type and reaction mode; world events interrupt plans; between-session catch-up summary communicates drift to the player.

### Scope

1. **BDI runtime** — a per-NPC scheduler that runs (a) on every relevant world event (chat turn, world tick, time advance) and (b) between sessions for "the world continues without you" behavior. Bids on goals → selects intentions → enacts plan steps.
2. **Aspiration-driven planning** — `epic-character-internal-traits.md` defines aspirations as structured data. This epic consumes them as Desire inputs.
3. **Mood modulation** — `TASK-character-mood-happiness.md` defines mood as PAD (Pleasure-Arousal-Dominance). Mood shifts plan priorities (e.g. low-arousal NPC picks rest over adventure) and reaction mode (sad NPC deflects vs engages).
4. **Time-scale integration** — `epic-time-scale.md` advances game time; BDI plans are anchored to game-time ticks so a 3-day plan in-world means 3 days, not 3 turns.
5. **Between-session persistence** — `TASK-living-world-persistence.md` (already orphaned) extends the BDI runtime so NPC schedules advance offline. On player return, a "catch-up" message summarizes what happened.
6. **Player-facing surface** — a per-NPC "life log" view that shows current intentions, recent actions, and drift over time.

### Tasks

- [ ] BDI runtime (`src/npc/bdi/{runtime,scheduler,plan-store}.ts`)
- [ ] Aspiration consumer (trait-as-Desire bridge)
- [ ] Mood modulation hook (PAD-as-priority-modifier)
- [ ] Time-scale integration (game-time tick anchor)
- [ ] Between-session persistence + catch-up summary
- [ ] NPC life-log UI
- [ ] Tests for BDI determinism (same inputs → same plan)

**Acceptance Criteria:**
- [ ] BDI runtime produces plans for 100 NPCs in < 1s p95
- [ ] Aspirations measurably influence plan priorities (regression test: aspiration Y vs Z produces different plans)
- [ ] Mood shifts measurably change reaction modes (regression test: low-arousal NPC rejects high-arousal plans)
- [ ] Game-time advance triggers BDI tick; plans anchored to game-time, not wall-clock
- [ ] Between-session persistence: NPC state survives 7 simulated in-world days; catch-up summary mentions ≥ 3 events
- [ ] Player can inspect any NPC's life log; UI updates within 100ms of BDI tick

### Related Epics

- `epic-character-internal-traits.md` — aspirations (Dependence)
- `epic-character-internal-traits.md` — moral disposition (drives Desire selection)
- `epic-character-growth.md` — character growth (long-term Desire evolution)
- `epic-memory-knowledge-systems.md` — episodic memory (Belief source)
- `epic-time-scale.md` — game-time tick anchor
- `epic-actor-autonomy-story-drive.md` — story-level autonomy (sibling; player-facing)
- `epic-npc-management-ui.md` — UI surface
- `epic-living-world-between-session` (if it exists; otherwise this epic owns that surface)

## Rationale

The matrix audit identifies three gaps (G27, G28, G32) that all stem from one missing system: a **BDI loop that integrates aspirations + mood + persistence**. Three orphan tickets (`TASK-npc-bdi-planning.md`, `TASK-character-mood-happiness.md`, `TASK-living-world-persistence.md`) are already filed but each assumes the other exists. Without an epic to anchor them:

1. **Aspirations are aspirational, not actionable** — `epic-character-internal-traits.md` defines them, but nothing turns them into plans.
2. **Mood is a UI number** — `TASK-character-mood-happiness.md` measures it, but nothing acts on it.
3. **Persistence is a wish** — `TASK-living-world-persistence.md` imagines it, but the runtime doesn't exist.

Generative-agents (Stanford), Inworld AI, and Convai all ship BDI-style loops in production. The pattern is mature; loop-lore has the prerequisites (traits, mood, memory, time-scale) but not the integration.

This epic also closes matrix gaps G29 (NPC-to-NPC social, G30 (memory for social topics), G33 (relationship drift) — all of which need a BDI runtime to ask "what does this NPC want right now?"

## Open questions

1. **LLM-as-BDI** — should BDI reasoning be LLM-driven (one LLM call per NPC per tick) or rule-driven (deterministic utility functions)? LLM is more expressive but expensive; rule-based is fast but rigid. Generative-agents use LLM reflection; Inworld uses hybrid.
2. **Multi-NPC coordination** — when two NPCs want the same resource, do they negotiate (LLM-mediated) or compete (rule-mediated)? Matrix G29 implies LLM-mediated, but that's a cost concern.
3. **Player intervention** — can the player override an NPC's current intention? If yes, what's the surface (admin panel, in-character speech, GM only)?
4. **World event priority** — when an in-character crisis (battle, romance, betrayal) interrupts an NPC's plan, does BDI automatically adapt or require player / GM intervention?
5. **Determinism vs surprise** — generative-agents explicitly value surprise; loop-lore's RPG-flavored product may value determinism (so a "fixed point" NPC behaves the same on every replay). Where on this axis does the epic land?
6. **Cost** — BDI ticks for 100 NPCs at LLM cost are nontrivial. Should BDI be opt-in per NPC (paid feature) or always-on (operator-billed)?

**Tags:** idea, matrix-gap, g27, g28, g32, npc-autonomy, bdi, generative-agents, inworld, convai, cross-cutting
**Related:** .plan/matrix-cross-mechanics.md (G27, G28, G29, G30, G32, G33), .plan/epics/epic-character-internal-traits.md, .plan/epics/epic-memory-knowledge-systems.md, .plan/epics/epic-time-scale.md, .plan/epics/epic-actor-autonomy-story-drive.md, .plan/tickets/TASK-npc-bdi-planning.md, .plan/tickets/TASK-character-mood-happiness.md, .plan/tickets/TASK-living-world-persistence.md

git issue: 00000000
