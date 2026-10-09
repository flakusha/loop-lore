<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Factions, Reputation & Persistent Consequences

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** reputation is canonical and shipped — `src/schemas/reputation.ts` (`ReputationScore`, tiers, `applyReputationChange`) is consumed by NSFW seduction tiers, encounter completion, assistant commands, and battle surrender; faction machinery (tables, CRUD, standing, politics) has no backend and the faction UI is mock-only (`src/frontend/alpine/npc-faction-mock.ts`); `.plan/tickets/index.json` marks `FEAT-faction-system-backend` Done although no faction backend exists (verified 2026-10-09)
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
| Faction CRUD + world linkage | `TASK-faction-relations-list-and-standing.md` | Done (UI mock only — no backend) |
| Standing computation on choice events | `TASK-faction-standing-and-reputation-drift-integration.md` | Not Started |
| Quest / NPC gating by standing | (covered in quest/encounter epic) | Not Started |
| World-state persistence + archival | `TASK-faction-politics-coups-and-expansion-engine.md` | Not Started |
| Faction leader + cadre generation | `TASK-faction-leaders-and-cadre-generation.md` | Not Started |

## Implemented (verified 2026-10-09)

**Tables:**

- None. Faction standing has no table; reputation deltas persist in the existing
  `status_effect` rows (`category: "reputation"`, written by `src/rpg/reputation.ts`).

**Modules:**

- `src/schemas/reputation.ts` — `ReputationScore`, `REPUTATION_TIERS` (hostile → devoted),
  `REPUTATION_TIER_ORDER`, `getReputationTier`, `clampReputation`, `createReputationScore`,
  `applyReputationChange`, `applyReputationDecay`; re-exported from `src/schemas/index.ts`
- `src/rpg/reputation.ts` — NSFW `ReputationService`: applies deltas and replays them through
  the canonical calculator; per design there is no NSFW-private reputation table

**Shipped:**

- Tier-gated seduction prerequisites — `src/nsfw/seduction-prerequisites.ts` via
  `src/nsfw/social-integration.ts`; wired in `src/routes/nsfw/seduction.ts` (`reputationTier` param)
- Encounter reputation legs — `src/rpg/encounters/service/reputation-leg.ts`
- Assistant interaction commands — `src/assistant/commands/interaction.ts` (`getReputationTier`)
- Battle surrender weighs attacker reputation as a plain number —
  `src/battle/social-integration/surrender.ts` (`calculateSurrenderChance`)
- Integration-registry declarations only — `src/rpg/integration-registry/edges/faction.ts`
  (`FACTION_EDGES`; the `faction.standing_changed` event has no emitter)

## Current State

| Surface | Status | Where |
| ------- | ------ | ----- |
| `ReputationScore` shared schema | Shipped | `src/schemas/reputation.ts`; re-exported in `src/schemas/index.ts` |
| Reputation persistence + replay (NSFW) | Shipped | `src/rpg/reputation.ts` — `status_effect` rows (`category: "reputation"`) replayed through the canonical calculator |
| Reputation consumers | Shipped | `src/nsfw/social-integration.ts` + `src/nsfw/seduction-prerequisites.ts`, `src/routes/nsfw/seduction.ts`, `src/rpg/encounters/service/reputation-leg.ts`, `src/assistant/commands/interaction.ts`, `src/battle/social-integration/surrender.ts` (numeric input) |
| Faction CRUD + relations list | UI mock only | `src/frontend/alpine/npc.ts` + `src/frontend/alpine/npc-faction-mock.ts` (`MOCK_FACTIONS`); `TASK-faction-relations-list-and-standing.md` (Done — "Mock data — no backend dependency") |
| Faction tables / routes / services | Not Started | `rg -i faction src/db src/routes` → 0 hits; no `src/factions/`, no `src/rpg/faction/` |
| Faction standing schema + migration | Not Started | `TASK-faction-standing-schema.md` (open) |
| `FactionStanding` type | Not Started | declared in Shared Data Contracts below; no `src/rpg/faction/` module |
| Standing drift on choice events | Not Started | — |
| Faction politics engine | Not Started | `src/factions/politics.ts` does not exist |
| Faction leaders / cadre | Not Started | — |

> **Discrepancy (recorded, not resolved here):** `.plan/tickets/index.json` marks
> `FEAT-FACTION-SYSTEM-BACKEND` (epic: `epic-faction-reputation`, git issue `1ce0576`)
> as **Done**, and `.plan/tickets/FEAT-faction-system-backend.md` closed it on 2026-09-19
> as a "duplicate" covered by `src/schemas/reputation.ts`. But that ticket's scope
> (`src/factions/` + relations + standings) does not exist in `src/` — only the reputation
> schema it cited shipped. `TASK-rpg-faction-reputation.md` is likewise marked Done while
> its faction standing/quests/gated-blueprints scope has no implementation. Faction
> machinery remains unbuilt; those two ticket statuses overstate the code.
> There is no `src/rpg/faction/` directory; `src/schemas/reputation.ts` is the one
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

## Related Epics

- `epic-worlds-extension.md` — world state persistence
- `epic-social-interaction.md` — reputation schema and relationship state
- `epic-crafting-professions.md` — reputation-gated blueprints
- `epic-rpg-mechanics.md` — stats and quest requirements
- `epic-emergent-narrative-design.md` — persistent consequences
- `epic-economy-trading.md` — faction currency and trade pacts
- `epic-stealth-crime.md` — criminal factions and law reputation
- `epic-world-locations.md` — territory control
- `epic-character-core-system.md` — NPC-faction loyalty modeling

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

- `TASK-faction-reputation.md` (open)
- `TASK-faction-standing-schema.md` (open)
- `TASK-faction-relations-list-and-standing.md` (Done — UI mock only, no backend)
- `TASK-faction-standing-and-reputation-drift-integration.md` (Not Started)
- `TASK-faction-politics-coups-and-expansion-engine.md` (Not Started)
- `TASK-faction-leaders-and-cadre-generation.md` (Not Started)
- `TASK-rpg-faction-reputation.md` (Done in `.plan/tickets/index.json` — disputed: claimed faction standing/quests/gated-blueprints scope has no implementation)
- `FEAT-faction-system-backend.md` (Done in `.plan/tickets/index.json` — disputed: closed as duplicate of `src/schemas/reputation.ts`, but `src/factions/` does not exist)
- `TASK-faction-membership-relationship-propagation.md` (Not Started)
- `TASK-faction-relation-graph-on-2d-canvas-backend-first.md` (Not Started)
