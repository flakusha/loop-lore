<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Battle Integration Gaps — Items, Social, NPC, Weather, Resolution

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Largely shipped — all five core gaps (G1–G5) have live integration code (verified 2026-10-09); economy integration and battle-scoped UI exposure of social/item actions remain open.
**Priority:** High
**Effort:** High
**Issue:** `e8b0c6b`
**Type:** Feature Epic
**Tags:** battle, items, social, npc, weather, resolution, integration

## Summary

The Battle epic is the most impactful gap in cross-system integration. It touches most RPG sub-systems but references only RPG Mechanics and World & Locations. This epic tracks adding integration sections for Items/Inventory, Social, NPC/Actor, Weather/Terrain, and Resolution System.

## Implemented (verified 2026-10-09)

- **Modules:** `src/battle/items-integration.ts` + `src/battle/item-mapping.ts` (equipment stats, durability, loot generation); `src/battle/social-integration/` (`offensive.ts`, `support.ts`, `morale.ts`, `surrender.ts`); `src/battle/npc-integration/` (`decision.ts`, `memory.ts`, `personality.ts`); `src/battle/weather-integration/` (`modifiers.ts`, `hazards.ts`, `position.ts`, `terrain.ts`); `src/battle/resolution-integration/` + `src/battle/integration-schemas/`
- **Routes:** `src/routes/battle/` — `equipment.ts` (loot route at `:180` persists drops via `giveToNpc`/`placeInLocation` at `:233`), `equipment-durability.ts`, `social.ts`, `morale.ts`, `npc.ts`, `weather.ts`, `resolution.ts`; mounted via `src/routes/v1/actors-surface.ts:90`
- **Shipped:** all five gaps G1–G5 closed; loot-drop-to-inventory pipeline live (battle loot lands in `world_items` via NPC or location destination). Still open: economy integration, battle-scoped UI exposure of social/item actions.

## Current State

| Surface | Status | Where |
| --- | --- | --- |
| G1 Battle ↔ Items/Inventory (equipment, durability, loot) | Shipped | `src/battle/items-integration.ts`, `src/routes/battle/equipment.ts:180` |
| G2 Battle ↔ Social (intimidate/taunt/surrender/morale) | Shipped | `src/battle/social-integration/`, `src/routes/battle/social.ts`, `src/routes/battle/morale.ts` |
| G3 Battle ↔ NPC (decision engine) | Shipped | `src/battle/npc-integration/`, `src/routes/battle/npc.ts` |
| G4 Battle ↔ Weather/Terrain (modifiers, hazards) | Shipped | `src/battle/weather-integration/`, `src/routes/battle/weather.ts` |
| G5 Resolution unification (dice, DCs) | Shipped | `src/battle/resolution-integration/`, `src/routes/battle/resolution.ts` |
| Battle-scoped UI exposure of social/item actions | Not Started | — (see `./epic-battle-ui.md`) |
| Economy integration (loot valuation, market impact) | Not Started | — (see `./epic-economy-trading.md`) |

## Unticketed Gaps

The backend social actions and combat item-use ship behind HTTP routes (`src/routes/battle/social.ts`, `src/routes/battle/equipment.ts`), but the battle panel exposes only Attack/Heal/End (`src/frontend/battle/commands.ts:38-41`) — no in-battle UI surface reaches them, and wiring the panel to these routes is unticketed (see `./epic-battle-ui.md`). Inventory capacity management is also absent: loot lands in `world_items`/NPC inventories with no cap or overflow handling, and that gap has no ticket.

## Overview

### Current State Assessment

| System            | RPG | Battle | Magic | Crafting | Companion | Housing | Disease | Social | Weather | Exploration | Economy | Crime | Faction | NSFW | CharCore | Resolution | Narrative |
| ----------------- | --- | ------ | ----- | -------- | --------- | ------- | ------- | ------ | ------- | ----------- | ------- | ----- | ------- | ---- | -------- | ---------- | --------- |
| **RPG Mechanics** | —   | ✅     | ✅    | ➡️        | ➡️         | —       | ➡️       | ✅     | —       | ✅          | ➡️       | —     | —       | ➡️    | —        | —          | —         |
| **Battle**        | ✅  | —      | ✅    | —        | ❌        | 🚫      | ❌      | ❌     | ❌      | ➡️           | —       | —     | —       | —    | 🚫       | —          | —         |

### Key Integration Gaps

#### 🔴 High — Missing bidirectional links between major systems

> **Verified 2026-10-09:** all five gaps below now have shipped integration code under `src/battle/*-integration/` + `src/routes/battle/`. G1's "No loot-drop-to-inventory pipeline" claim is stale — the pipeline exists.

| #  | System A       | System B                    | Current State (verified 2026-10-09)                                                                                                                                         | Evidence                                                                                                        |
| -- | -------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| G1 | **Battle**     | **Items/Inventory**         | Closed — equipment stats/durability/combat-use, loot generation and persistence to `world_items` via NPC or location destination. | `src/battle/items-integration.ts`, `src/battle/item-mapping.ts`, `src/routes/battle/equipment.ts:180` (loot route mints `world_items` via `giveToNpc`/`placeInLocation`) |
| G2 | **Battle**     | **Social Interaction**      | Closed — intimidate/taunt/rally/inspire/demoralize, surrender, and morale are live backend surfaces. | `src/battle/social-integration/` (`offensive.ts`, `support.ts`, `morale.ts`, `surrender.ts`), `src/routes/battle/social.ts`, `src/routes/battle/morale.ts` |
| G3 | **Battle**     | **NPC/Actor System**        | Closed — NPC decision engine with memory wired to HTTP. | `src/battle/npc-integration/` (`decision.ts`, `memory.ts`, `personality.ts`), `src/routes/battle/npc.ts` |
| G4 | **Battle**     | **Weather/Terrain**         | Closed — environmental modifiers, visibility, hazards, position. | `src/battle/weather-integration/` (`modifiers.ts`, `hazards.ts`, `position.ts`), `src/routes/battle/weather.ts` |
| G5 | **Resolution** | **All Combat/Social/Magic** | Closed — unified resolution integrated and routed; boundary + check coverage in `src/battle/resolution-integration/`. | `src/battle/resolution-integration/`, `src/routes/battle/resolution.ts` |

## Integration Points

### Systems This Epic Depends On

| System          | What It Provides                             | How Used                               |
| --------------- | -------------------------------------------- | -------------------------------------- |
| Items/Inventory | Equipment stats, consumables, loot tables    | Combat modifiers, item usage           |
| Social          | Morale, persuasion, intimidation             | Combat options, surrender, negotiation |
| NPC/Actor       | Personality-driven AI, memory, relationships | Enemy behavior, ally coordination      |
| Weather/Terrain | Environmental modifiers, hazards             | Combat conditions, positioning         |
| Resolution      | Unified dice resolution, difficulty classes  | All combat and skill checks            |

### Systems That Depend On This Epic

| System         | What It Consumes                 | How Used                            |
| -------------- | -------------------------------- | ----------------------------------- |
| NSFW           | Combat modifiers for rough play  | Power-exchange encounter mechanics  |
| Character Core | Traits, mood for combat behavior | Personality-driven combat decisions |
| Economy        | Loot valuation, market impact    | Post-battle rewards, item pricing   |

### Shared Data Contracts

| Contract                | Shared With           | Purpose                                |
| ----------------------- | --------------------- | -------------------------------------- |
| `CombatStats`           | Character Core, Items | Unified stat calculation               |
| `MoraleState`           | Social                | Combat morale from social interactions |
| `EnvironmentalModifier` | Weather               | Combat condition modifiers             |
| `ResolutionRoll`        | Resolution            | Unified dice roll structure            |

### Cross-System Events

| Event             | Direction  | Purpose                                   |
| ----------------- | ---------- | ----------------------------------------- |
| `battle.started`  | emits      | Inject weather/terrain modifiers          |
| `battle.ended`    | emits      | Update social reputation, distribute loot |
| `morale.broken`   | emits      | Trigger surrender/negotiation             |
| `weather.changed` | subscribes | Recalculate combat modifiers              |
| `item.used`       | subscribes | Apply consumable effects in combat        |

## Tasks

### Core Integration (High Priority)

- [ ] **Equipment System Integration**
  - How equipment affects battle stats
  - Item durability degradation in combat
  - Set bonuses and equipment effects
  - Equipment-specific combat actions

- [ ] **Social Skill Integration**
  - Intimidation mechanics (morale checks)
  - Taunt and negotiation in combat
  - Surrender and truce mechanics
  - Social reputation effects in battle

- [ ] **NPC/Actor Integration**
  - Personality-driven enemy AI
  - Memory of past battles
  - Relationship-based combat behavior
  - Morale system from Social

- [ ] **Weather/Terrain Integration**
  - Environmental combat modifiers
  - Terrain cover and elevation
  - Weather hazards and conditions
  - Environmental advantage/disadvantage

- [ ] **Resolution System Integration**
  - Unified dice resolution for combat
  - Critical hit/fumble mechanics
  - Difficulty class consistency
  - Skill check integration

### Content System Integration (Medium Priority)

- [ ] **Items/Inventory Loot Integration**
  - Loot drop mechanics
  - Inventory capacity management
  - Item quality and rarity tiers
  - Loot table integration

- [ ] **Economy Integration**
  - Loot valuation and pricing
  - Market impact of battle outcomes
  - Item trading and economy effects
  - Battle-related economic events

## Implementation Notes

### Integration Strategy

1. **Start with Core Mechanics**
   - Equipment stats and combat modifiers
   - Weather/environmental effects
   - Basic morale system

2. **Add Social Integration**
   - Intimidation and negotiation
   - Surrender mechanics
   - Social reputation

3. **Complete NPC/Actor Integration**
   - Personality-driven AI
   - Memory and relationships
   - Advanced morale system

4. **Final Polish**
   - Resolution system unification
   - Economy integration
   - Content system completion

### Technical Considerations

- **Performance**: Battle integration must be efficient for real-time combat
- **Scalability**: Support for large-scale battles (many NPCs, many players)
- **Modularity**: Plugin system for custom battle mechanics
- **Extensibility**: Hook system for third-party battle content

## Files

Implemented (verified 2026-10-09):
- `src/battle/items-integration.ts`, `src/battle/item-mapping.ts` — equipment stats, durability, loot generation + persistence
- `src/battle/social-integration/` — `offensive.ts`, `support.ts`, `morale.ts`, `surrender.ts`
- `src/battle/npc-integration/` — `decision.ts`, `memory.ts`, `personality.ts`
- `src/battle/weather-integration/` — `modifiers.ts`, `hazards.ts`, `position.ts`, `terrain.ts`
- `src/battle/resolution-integration/` + `src/battle/integration-schemas/` — unified dice resolution
- `src/routes/battle/` — `equipment.ts`, `equipment-durability.ts`, `social.ts`, `morale.ts`, `npc.ts`, `weather.ts`, `resolution.ts`
- `docs/spec/battle-integration.md` — integration documentation

Planned (do not exist yet):
- `src/battle/equipment.ts`, `src/battle/social.ts`, `src/battle/npc-ai.ts`, `src/battle/environment.ts`, `src/battle/resolution.ts`, `src/battle/loot.ts` — superseded by the shipped `*-integration` modules above
- `src/db/schema-battle.ts` — battle tables live in `src/db/schema-core.ts:881-931` instead
- `src/routes/battle.ts` — superseded by `src/routes/battle/`

## Related Epics

- `epic-rpg-mechanics.md` — stats and dice shared with battle
- `epic-items.md` — equipment/inventory backing G1
- `epic-social-interaction.md` — morale and reputation backing G2
- `epic-actors.md` — NPC personality backing G3
- `epic-weather-environment.md` — environmental modifiers backing G4
- `epic-resolution-system.md` — unified dice resolution backing G5
- `epic-character-core-system.md` — traits and mood for combat behavior
- `epic-nsfw-game-mechanics.md` — rough-play / power-exchange mechanics
- `epic-economy-trading.md` — loot valuation and market impact

## Linked Tasks

- `TASK-battle-integration-gaps.md` (Done)
- `TASK-battle-equipment-integration.md` (Done)
- `TASK-battle-social-integration.md` (open)
- `TASK-battle-npc-integration.md` (open)
- `TASK-battle-environment-integration.md` (open)
- `TASK-battle-resolution-integration.md` (open)
- `TASK-battle-loot-integration.md` (open)

## Open Questions

### Battle System Design

- How many participants can engage in a single battle?
- Should battles be turn-based or real-time?
- How should AI difficulty scale?
- What's the combat speed? (fast-paced vs strategic)

### Integration Complexity

- Should integration be tight (shared code) or loose (API calls)?
- How to handle performance-critical paths?
- Should there be fallback behavior when systems are unavailable?
- How to handle compatibility between different integration approaches?

### Content Management

- How to handle large battle content (maps, NPCs, items)?
- Should battles be editable by content creators?
- How to balance combat content with story content?
- Should there be battle templates?

## Implementation Phases

### Phase 1: Core Integration

- Equipment system integration
- Weather/terrain integration
- Basic morale system

### Phase 2: Social Integration

- Intimidation and negotiation
- Surrender mechanics
- Social reputation

### Phase 3: NPC/Actor Integration

- Personality-driven AI
- Memory and relationships
- Advanced morale

### Phase 4: Resolution System

- Unified dice resolution
- Critical hit/fumble
- Difficulty classes

### Phase 5: Content Integration

- Loot and inventory
- Economy integration
- NSFW rough play support

### Phase 6: Polish

- Performance optimization
- Plugin system support
- Content management tools
- Documentation and examples

## Success Metrics

- **Technical**
  - All battle systems integrated
  - Performance targets met
  - Plugin system functional
  - Content management working

- **Content**
  - 100+ battle scenarios
  - 500+ combat actions
  - 200+ equipment items
  - 100+ NPC personalities

- **User Experience**
  - Smooth combat flow
  - Intuitive controls
  - Meaningful choices
  - Engaging feedback

## Related Resources

- [Battle System Design Doc](docs/spec/battle.md)
- [Equipment System Specs](docs/spec/items.md)
- [Social Interaction Design](docs/spec/social-interaction.md)
- [NPC Actor System](docs/spec/npcs.md)
- [Weather System](docs/spec/weather-environment.md)
- [Resolution System](docs/spec/battle.md)
- [Content Management](docs/spec/artifacts-system.md)
- [Plugin System](docs/spec/plugin-system.md)
