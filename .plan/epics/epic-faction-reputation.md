# EPIC: Factions, Reputation & Persistent Consequences

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Source:** .plan/research/rpg-landscape.md §6.6, §6.8, §9, §10
**Spec:** `docs/spec/quests-encounters.md` (data model, schema, implementation notes)

## Summary

Worlds can define **factions** that control territory, issue quests, and track
**per-character standing**. Player choices shift standing, which alters available
quests/NPCs — and, **Undertale-style**, consequences persist in world state. This is the
social layer that predates engines (forum-RP reputation/consent systems, §4.3).

## Core systems

- **Faction entity:** id, name, territory, quest pool, own storyline.
- **Per-character standing:** numeric, **non-binary** (gradations, not ally/foe binary).
- **Reputation** as social currency; gated blueprints/quests (ties to crafting).
- **Territory control** → persistent geopolitical narrative (conquered strongholds
  become persistent metropolises).
- **Persistent consequences:** choices write to world state (archival / versioned).

## Why (from research)

- MMO template (factions / territory); forum-RP reputation systems (§4.3, §6.6).
- Undertale exemplar: consequences persist → progression has meaning beyond
  number-go-up (§6.8).

## Tasks

- TASK-faction-standing-schema
- Faction CRUD + world linkage
- Standing computation on choice events
- Quest / NPC gating by standing
- World-state persistence + archival

## Integration Points

- **Social Interaction** — Shared reputation schema; faction standing feeds into social checks
- **RPG Mechanics** — Stats affect faction quest requirements
- **Crime & Stealth** — Criminal factions, law enforcement reputation
- **Economy System** — Faction currency, trade agreements
- **World & Locations** — Territory control, faction territories

> **Note (G14):** Faction standing and Social reputation MUST share a unified `ReputationScore` type. Two systems defining reputation differently will conflict at implementation. The `PlayerState` social layer accumulates conditions from both systems.

## Related

`epic-worlds-extension.md`, `epic-social-interaction.md`,
`epic-crafting-professions.md` (reputation-gated blueprints), `epic-rpg-mechanics.md`,
`epic-emergent-narrative-design.md`

## Linked Tasks

- TASK-faction-reputation.md
