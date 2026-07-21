# EPIC: Companion, Pet & Mount Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Type:** Feature Epic
**Tags:** companions, pets, mounts, taming, riding, pet-battles

## Overview

Companion, pet, and mount system — NPC companions with loyalty/progression, pet taming/evolution, mount riding/training, and pet battle mechanics. Integrates with existing actor system and RPG mechanics.

## Companion System

### Companion Types

| Type                  | Description                          | Progression        |
| --------------------- | ------------------------------------ | ------------------ |
| **Story Companion**   | NPCs from quests, unique backstories | Relationship-based |
| **Hired Mercenary**   | Temporary combat allies              | Gold-based         |
| **Summoned Creature** | Magic-summoned allies                | Duration-based     |
| **Familiar**          | Bonded magical creatures             | Spirit-bound       |

### Companion Structure

```typescript
interface Companion {
  id: string;
  name: string;
  type: "story" | "mercenary" | "summoned" | "familiar";
  actor: Actor; // Uses existing actor system
  loyalty: number; // 0-100
  relationship: RelationshipType;
  personality: PersonalityTrait[];
  abilities: CompanionAbility[];
  equipment: EquipmentSlot[];
  memories: CompanionMemory[];
  ai_behavior: AIBehavior;
  progression: CompanionProgression;
}

interface CompanionProgression {
  level: number;
  experience: number;
  skills: Skill[];
  specializations: Specialization[];
  unlocks: CompanionUnlock[];
}

interface AIBehavior {
  combat_role: "tank" | "dps" | "healer" | "support";
  aggression: number; // 0-100
  self_preservation: number; // 0-100
  loyalty_threshold: number; // Below this, companion may leave
}
```

### Companion Relationship

```typescript
interface Relationship {
  companion_id: string;
  player_id: string;
  level: number; // 1-10
  experience: number;
  trust: number; // 0-100
  mood: MoodState;
  memories: RelationshipMemory[];
  dialogue_options: DialogueOption[];
  gift_preferences: GiftPreference[];
  romance_available: boolean;
}

type RelationshipType = "friendly" | "romantic" | "mentor_student" | "rivalry" | "professional";
```

### Companion Loyalty Events

| Event                      | Loyalty Effect | Notes                |
| -------------------------- | -------------- | -------------------- |
| Completing quests together | +5-15          | Shared experiences   |
| Giving gifts               | +1-10          | Based on preference  |
| Winning battles            | +3-8           | Combat effectiveness |
| Losing battles             | -2-5           | Morale impact        |
| Ignoring companion         | -1/day         | Neglect              |
| Betrayal decisions         | -20-50         | Major story impact   |
| Saving companion life      | +15-25         | Heroic moment        |

## Pet System

### Pet Types

| Type             | Description              | Abilities                   |
| ---------------- | ------------------------ | --------------------------- |
| **Combat Pet**   | Fights alongside player  | Combat skills               |
| **Utility Pet**  | Provides utility bonuses | Gathering, crafting bonuses |
| **Cosmetic Pet** | Visual companion         | Emotes, following           |
| **Battle Pet**   | Pet-vs-pet combat        | Pet battle skills           |

### Pet Structure

```typescript
interface Pet {
  id: string;
  name: string;
  species: string;
  type: "combat" | "utility" | "cosmetic" | "battle";
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  level: number;
  experience: number;
  stats: PetStats;
  abilities: PetAbility[];
  evolution: EvolutionChain;
  happiness: number; // 0-100
  hunger: number; // 0-100
  loyalty: number; // 0-100
  appearance: PetAppearance;
  memories: PetMemory[];
}

interface PetStats {
  health: number;
  attack: number;
  defense: number;
  speed: number;
  special: number;
}
```

### Pet Taming

```typescript
interface TamingAttempt {
  target: WildPet;
  tamer: Character;
  method: "food" | "combat" | "seduction" | "magic" | "trap";
  success_chance: number;
  items_used: Item[];
  result: TamingResult;
}

interface TamingResult {
  success: boolean;
  pet?: Pet;
  trust_gained: number;
  loyalty_start: number;
  failure_reason?: string;
}
```

### Pet Evolution

```typescript
interface EvolutionChain {
  stages: EvolutionStage[];
  current_stage: number;
  evolution_requirements: EvolutionRequirement[];
}

interface EvolutionStage {
  name: string;
  level_required: number;
  happiness_required: number;
  special_item?: string;
  stat_bonuses: PetStats;
  new_abilities: PetAbility[];
  appearance_change: PetAppearance;
}
```

## Mount System

### Mount Types

| Type           | Speed     | Terrain  | Special              |
| -------------- | --------- | -------- | -------------------- |
| **Horse**      | Fast      | Land     | Endurance            |
| **Dragon**     | Very Fast | Air/Land | Flying, fire breath  |
| **Griffin**    | Fast      | Air/Land | Flying, dive attack  |
| **Wolf**       | Medium    | Land     | Pack bonus           |
| **Bear**       | Slow      | Land     | Tank, carry capacity |
| **Boat**       | Medium    | Water    | Naval travel         |
| **Mechanical** | Variable  | Land/Air | Customizable         |

### Mount Structure

```typescript
interface Mount {
  id: string;
  name: string;
  species: string;
  type: "land" | "air" | "water" | "amphibious";
  speed: number;
  stamina: number;
  carry_capacity: number;
  abilities: MountAbility[];
  equipment: MountEquipment[];
  training: MountTraining;
  appearance: MountAppearance;
  happiness: number;
  loyalty: number;
}

interface MountTraining {
  level: number;
  experience: number;
  skills: MountSkill[];
  tricks: MountTrick[];
  combat_training: boolean;
}

interface MountEquipment {
  slot: "saddle" | "barding" | "accessory" | "bags";
  item: Item;
  bonuses: MountBonus[];
}
```

### Mount Riding

```typescript
interface RidingSession {
  mount: Mount;
  rider: Character;
  terrain: TerrainType;
  distance: number;
  duration: number;
  stamina_cost: number;
  speed_modifier: number;
  encounters: Encounter[];
}
```

## Pet Battle System

### Battle Pets

```typescript
interface BattlePet {
  pet: Pet;
  battle_stats: BattleStats;
  abilities: BattleAbility[];
  team_slot: number;
}

interface BattleStats {
  health: number;
  power: number;
  speed: number;
  defense: number;
  special: number;
}

interface BattleAbility {
  id: string;
  name: string;
  type: "attack" | "buff" | "debuff" | "heal";
  element?: Element;
  power: number;
  accuracy: number;
  cooldown: number;
  effects: BattleEffect[];
}
```

### Pet Battle Flow

1. **Challenge** — Initiate battle with wild pet or NPC
2. **Team Selection** — Choose 1-3 battle pets
3. **Turn Order** — Based on pet speed
4. **Actions** — Attack, switch pet, use item, flee
5. **Resolution** — Damage/effect calculation
6. **Victory/Defeat** — XP gain, pet capture chance

## Integration Points

- **Actor System** — Companions use actor system for personality/memory
- **RPG Mechanics** — Stats affect pet/mount performance
- **Combat System** — Companions/pets in battle
- **Inventory System** — Pet/mount equipment
- **World & Locations** — Wild pet spawns, mount terrain

## Open Questions

- How many companions can accompany the player?
- Should companions have their own inventory?
- How to handle companion death (permanent vs. revive)?
- Should mounts level up or stay static?
- How to balance pet battles with main combat?

## Files

- `src/rpg/companions/` — companion system
- `src/rpg/pets/` — pet system
- `src/rpg/mounts/` — mount system
- `src/rpg/companions/progression.ts` — companion progression
- `src/rpg/pets/taming.ts` — pet taming
- `src/rpg/pets/evolution.ts` — pet evolution
- `src/rpg/pets/battles.ts` — pet battles
- `src/rpg/mounts/riding.ts` — mount riding
- `src/db/schema-companions.ts` — companion tables
- `src/routes/companions.ts` — companion API

## Related Epics

- **Epic RPG Mechanics** — Stats, progression
- **Epic Battle & Action Systems** — Combat integration
- **Epic World & Locations** — Wild spawns, terrain
- **Epic Actor System** — Personality, memory
