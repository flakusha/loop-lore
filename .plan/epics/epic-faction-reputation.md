<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Factions, Reputation & Persistent Consequences

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** factions, reputation, standing, territory, consequences
**Source:** .plan/epics/epic-rpg-patterns.md §6.6, §6.8, §9, §10
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

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Social Interaction | Reputation schema, relationship state | Faction standing feeds social checks (G14) |
| RPG Mechanics | Stats, quest requirements | Stats affect faction quest requirements |
| Crime & Stealth | Criminal factions, law enforcement | Criminal faction standing, law reputation |
| Economy & Trading | Faction currency, trade agreements | Faction stores, trade pacts |
| World & Locations | Territory control | Faction territories, influence zones |
| Character Core | Relationship state | NPC-faction loyalty modeling |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Social Interaction | Faction standing | Reputation gates social checks (G14) |
| Economy & Trading | Faction currency | Faction-priced goods, trade agreements |
| Crime & Stealth | Law enforcement standing | Crime shifts faction alignment |
| Character Core | Faction affinity | Character faction allegiance/relationships |
| Emergent Narrative Design | Consequence persistence | Faction standing persists narrative stakes |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `ReputationScore` | Social, NSFW, Crime, Narrative | **Unified reputation type (G14)** — MUST match social schema exactly |
| `FactionStanding` | Social, Crime | Faction-specific standing deltas |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `faction.standing_changed` | emits → Social, Crime, Economy | Standing shifts propagate to gating/pricing |
| `faction.territory_changed` | emits → World | Territory control updates world state |

> **Note (G14):** Faction standing and Social reputation MUST share a unified `ReputationScore` type. Two systems defining reputation differently will conflict at implementation. The `PlayerState` social layer accumulates conditions from both systems.

---

## Related

`epic-worlds-extension.md`, `epic-social-interaction.md`,
`epic-crafting-professions.md` (reputation-gated blueprints), `epic-rpg-mechanics.md`,
`epic-emergent-narrative-design.md`

## Linked Tasks

- TASK-faction-reputation.md
