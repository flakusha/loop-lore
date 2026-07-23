# EPIC: Factions, Reputation & Persistent Consequences

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Source:** .plan/research/rpg-landscape.md §6.6, §6.8, §9, §10

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

## Related

`epic-worlds-extension.md`, `epic-social-interaction.md`,
`epic-crafting-professions.md` (reputation-gated blueprints), `epic-rpg-mechanics.md`,
`epic-emergent-narrative-design.md`

## Linked Tasks

- TASK-faction-reputation.md
