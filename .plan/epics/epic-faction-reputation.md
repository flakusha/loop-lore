<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Factions, Reputation & Persistent Consequences

**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
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

| Task | Ticket | Status |
| ---- | ------ | ------ |
| Faction standing schema + migration | `TASK-faction-standing-schema.md` | open |
| Faction CRUD + world linkage | `TASK-faction-relations-list-and-standing.md` | Done |
| Standing computation on choice events | `TASK-faction-standing-and-reputation-drift-integration.md` | Not Started |
| Quest / NPC gating by standing | (covered in quest/encounter epic) | Not Started |
| World-state persistence + archival | `TASK-faction-politics-coups-and-expansion-engine.md` | Not Started |
| Faction leader + cadre generation | `TASK-faction-leaders-and-cadre-generation.md` | Not Started |

## Current State

| Surface | Status | Where |
| ------ | ------ | ----- |
| `ReputationScore` shared schema | Shipped | `src/schemas/reputation.ts` — consumed by Social, NSFW, Crime, Narrative |
| Faction CRUD + relations list | Shipped | `TASK-faction-relations-list-and-standing.md` (Done) |
| Faction standing schema + migration | Not Started | `TASK-faction-standing-schema.md` |
| `FactionStanding` type | Not Started | declared in Shared Data Contracts below; no `src/rpg/faction/` module |
| Standing drift on choice events | Not Started | — |
| Faction politics engine | Not Started | `src/factions/politics.ts` does not exist |
| Faction leaders / cadre | Not Started | — |

> There is no `src/rpg/faction/` directory. `src/schemas/reputation.ts` is the one
> shipped artifact, and it is a shared contract rather than faction machinery.
> The AC file cited by `TASK-faction-politics-coups-and-expansion-engine.md`
> (`src/factions/politics.ts` exporting `tickFactionPolitics`) is planned, not present.

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
`epic-emergent-narrative-design.md`, `epic-economy-trading.md`, `epic-stealth-crime.md`,
`epic-world-locations.md`, `epic-character-core-system.md`

## Dependencies

- `src/schemas/reputation.ts` — the `ReputationScore` contract this epic must
  match exactly (G14)
- `epic-social-interaction.md` — reputation schema and relationship state
- `epic-rpg-mechanics.md` — stats and quest requirements
- `epic-stealth-crime.md` — criminal factions and law enforcement

## Unticketed Gaps

- Quest / NPC gating by standing is listed as a task but has no ticket of its own
  (noted as "covered in quest/encounter epic", but no epic file carries it).
- Faction territory control (`faction.territory_changed`) has no ticket; the
  event is declared in Cross-System Events with no emitter.

## Linked Tasks

- TASK-faction-reputation.md
- `TASK-faction-standing-schema.md` (open)
- `TASK-faction-relations-list-and-standing.md` (Done)
- `TASK-faction-standing-and-reputation-drift-integration.md` (Not Started)
- `TASK-faction-politics-coups-and-expansion-engine.md` (Not Started)
- `TASK-faction-leaders-and-cadre-generation.md` (Not Started)
