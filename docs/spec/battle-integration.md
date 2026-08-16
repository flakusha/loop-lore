<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Battle Integration Gaps — Items, Social, NPC, Weather, Resolution

## Overview

The Battle epic is the most impactful gap in cross-system integration. It touches most RPG sub-systems but references only RPG Mechanics and World & Locations. This spec tracks adding integration sections for Items/Inventory, Social, NPC/Actor, Weather/Terrain, and Resolution System.

## Current State Assessment

| System            | RPG | Battle | Magic | Crafting | Companion | Housing | Disease | Social | Weather | Exploration | Economy | Crime | Faction | NSFW | CharCore | Resolution | Narrative |
| ----------------- | --- | ------ | ----- | -------- | --------- | ------- | ------- | ------ | ------- | ----------- | ------- | ----- | ------- | ---- | -------- | ---------- | --------- |
| **RPG Mechanics** | —   | ✅     | ✅    | ➡️        | ➡️         | —       | ➡️       | ✅     | —       | ✅          | ➡️       | —     | —       | ➡️    | —        | —          | —         |
| **Battle**        | ✅  | —      | ✅    | —        | ❌        | 🚫      | ❌      | ❌     | ❌      | ➡️           | —       | —     | —       | —    | 🚫       | —          | —         |

### Identified Integration Gaps

#### 🔴 High — Missing bidirectional links between major systems

| #  | System A       | System B                    | Current State                                                                                                                                                               | Recommended Action                                                                                              |
| -- | -------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| G1 | **Battle**     | **Items/Inventory**         | Battle uses "Use item" as action type but never references `epic-item-system-extensions` or inventory for loadout/equipment management. No loot-drop-to-inventory pipeline. | Add integration: equipment affects battle stats, loot drops feed inventory, item durability degrades in combat. |
| G2 | **Battle**     | **Social Interaction**      | Social lists "Intimidation in combat" as integration; Battle never mentions social skills as combat options (taunt, negotiate, surrender).                                  | Add integration: social checks during combat for morale breaks, surrender, intimidation effects.                |
| G3 | **Battle**     | **NPC/Actor System**        | Battle has NPC enemies but never references Actor system for personality-driven AI, morale, memory of past defeats.                                                         | Add integration: NPC actors drive enemy decisions, morale system from Social applies in combat.                 |
| G4 | **Battle**     | **Weather/Terrain**         | Weather lists "Combat System" integration; Battle never references weather/terrain modifiers.                                                                               | Add integration: environmental combat modifiers from Weather system, terrain cover from Exploration.            |
| G5 | **Resolution** | **All Combat/Social/Magic** | Resolution claims to unify dice resolution but has no integration section. Never references Battle, Social, Magic, or RPG.                                                  | Add integration section referencing all systems that use dice resolution.                                       |

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

## Integration Details

### G1: Battle ↔ Items/Inventory Integration

**Equipment System Integration**

- Equipment affects battle stats (weapons, armor, accessories)
- Item durability degrades during combat
- Set bonuses and equipment effects
- Equipment-specific combat actions

**Loot Integration**

- Loot drops feed inventory system with proper asset linking
- Inventory capacity management
- Item quality and rarity tiers
- Loot table integration

### G2: Battle ↔ Social Integration

**Social Skills in Combat**

- Intimidation mechanics (morale checks)
- Taunt and negotiation in combat
- Surrender and truce mechanics
- Social reputation effects in battle

**Morale System**

- Social checks during combat for morale breaks
- Surrender mechanics
- Intimidation effects
- Post-battle social reputation changes

### G3: Battle ↔ NPC/Actor Integration

**Personality-Driven AI**

- NPC actors drive enemy decisions via personality traits
- Memory of past battles
- Relationship-based combat behavior
- Morale system from Social

**NPC Behavior**

- Enemy personality-driven AI
- Memory of past defeats
- Relationship effects on combat behavior
- NPC mood affects combat performance

### G4: Battle ↔ Weather/Terrain Integration

**Environmental Combat Modifiers**

- Weather modifiers to combat stats (visibility, movement, accuracy)
- Terrain cover and elevation advantages
- Environmental hazards (storms, fire, traps)
- NSFW-specific environmental modifiers (privacy, discovery risk)

**Weather Effects**

- Environmental combat modifiers from Weather system
- Terrain cover from Exploration system
- Environmental hazards

### G5: Battle ↔ Resolution System Integration

**Unified Dice Resolution**

- All combat actions use unified dice resolution
- Skill checks (social, magic, physical) share resolution framework
- Critical hit/fumble mechanics unified across systems
- NSFW skill checks (seduction, arousal) use same resolution

**Difficulty Classes**

- Difficulty class consistency across all systems
- Skill check integration with resolution system

## Files

- `src/battle/equipment.ts` — equipment system
- `src/battle/social.ts` — social combat mechanics
- `src/battle/npc-ai.ts` — NPC decision making
- `src/battle/environment.ts` — weather and terrain
- `src/battle/resolution.ts` — unified dice system
- `src/battle/loot.ts` — loot and inventory integration
- `src/db/schema-battle.ts` — battle database tables
- `src/routes/battle.ts` — battle API endpoints
- `docs/spec/battle-integration.md` — integration documentation

## Technical Considerations

- **Performance**: Battle integration must be efficient for real-time combat
- **Scalability**: Support for large-scale battles (many NPCs, many players)
- **Modularity**: Plugin system for custom battle mechanics
- **Extensibility**: Hook system for third-party battle content

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
- [Resolution System](docs/spec/rpg-mechanics.md)
- [Plugin System](docs/spec/plugin-system.md)
