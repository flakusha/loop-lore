# TASK: Battle Integration Gaps — Items, Social, NPC, Weather, Resolution

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-battle-action-systems

## Summary

The Battle epic is the most impactful gap in cross-system integration. It touches most RPG sub-systems but references only RPG Mechanics and World & Locations. This ticket tracks adding integration sections for Items/Inventory, Social, NPC/Actor, Weather/Terrain, and Resolution System.

## Linked Epics

- `epic-battle-action-systems.md`
- `epic-item-system-extensions.md` (equipment, loot)
- `epic-social-interaction.md` (intimidation, surrender, morale)
- `epic-actors.md` (NPC personality-driven AI)
- `epic-weather-environment.md` (environmental combat modifiers)
- `epic-resolution-system.md` (unified dice resolution)
- `epic-character-core-system.md` (traits, mood)
- `epic-nsfw-game-mechanics.md` (rough play, power exchange)

## Acceptance Criteria

### G1: Battle ↔ Items/Inventory Integration

- [ ] Equipment affects battle stats (weapons, armor, accessories)
- [ ] Loot drops feed inventory system with proper asset linking
- [ ] Item durability degrades during combat
- [ ] Consumable items usable in combat (NSFW toys, aphrodisiacs)
- [ ] Item set bonuses trigger during battle

### G2: Battle ↔ Social Integration

- [ ] Social skills (persuasion, intimidation, deception) available as combat options
- [ ] Intimidation can break enemy morale (morale check)
- [ ] Surrender mechanics (negotiate vs fight)
- [ ] Taunt mechanics affect enemy targeting
- [ ] Post-battle social reputation changes

### G3: Battle ↔ NPC/Actor Integration

- [ ] NPC actors drive enemy decisions via personality traits
- [ ] NPC morale system from Social applies in combat
- [ ] NPCs remember past defeats (memory system)
- [ ] NPC relationships affect combat behavior (allies, rivals)
- [ ] NPC mood affects combat performance

### G4: Battle ↔ Weather/Terrain Integration

- [ ] Weather modifiers to combat stats (visibility, movement, accuracy)
- [ ] Terrain cover and elevation advantages
- [ ] Environmental hazards (storms, fire, traps)
- [ ] NSFW-specific environmental modifiers (privacy, discovery risk)
- [ ] Weather affects NSFW power-exchange encounters (public spaces)

### G5: Battle ↔ Resolution System Integration

- [ ] All combat actions use unified dice resolution
- [ ] Skill checks (social, magic, physical) share resolution framework
- [ ] Critical hit/fumble mechanics unified across systems
- [ ] NSFW skill checks (seduction, arousal) use same resolution
- [ ] Difficulty classes consistent across all systems

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
