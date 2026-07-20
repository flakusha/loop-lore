# TASK: Character vs World Data Separation

**Epic:** World & Locations / RPG Mechanics
**Priority:** High
**Effort:** Very High
**Status:** Not Started

## Summary

Clear interface and database separation between persistent character features and world/location-based overrides. Characters have immutable core traits set at creation; world/story can overlay clothes, lore, skill changes, buffs/debuffs, karma, and standing.

## Core Problem

Character data currently mixes:
- **Persistent features** (personality, traits, attributes, visuals) — set once, rarely change
- **Session/story overrides** (clothes, lore, skill modifiers) — change per world/story
- **World-specific state** (buffs/debuffs, karma, standing) — per-world, not global

Need clean separation so:
- Characters are portable across worlds without data loss
- World-specific modifications don't corrupt base character
- Multiple worlds can have different overrides for same character
- Changes can be traced to source (base vs world vs story vs item)

## Data Layers

### Layer 0: Character Core (Persistent, Immutable to World)
Set at character creation. Never modified by world/story.

```typescript
interface CharacterCore {
  id: string;
  name: string;
  species: string;
  gender: string;
  age: number;
  
  // Personality (immutable)
  personality_traits: PersonalityTrait[];
  core_values: string[];
  fears: string[];
  desires: string[];
  
  // Physical (birth suit — base appearance)
  physique: PhysiqueProfile;     // Body system (TASK-nsfw-body-physical)
  appearance: AppearanceProfile;  // Natural appearance
  voice: VoiceProfile;
  
  // Base attributes (start values)
  base_stats: CharacterStats;     // STR, DEX, CON, INT, WIS, CHA
  base_skills: CharacterSkills;   // Skill starting levels
  
  // Creator metadata
  creator_id: string;
  created_at: Date;
  visibility: CharacterVisibility;
  licensing: CharacterLicensing;
}
```

### Layer 1: Character Equipment (Current State)
Clothes, gear, items currently equipped. Can change freely.

```typescript
interface CharacterEquipment {
  character_id: string;
  
  // Visual overrides
  outfit: Outfit;              // Current clothes
  accessories: Accessory[];    // Jewelry, glasses, etc.
  hairstyle: Hairstyle;
  body_modifications: BodyModification[];  // Piercings, tattoos
  
  // Stat modifiers from equipment
  stat_bonuses: StatModifier[];
  skill_bonuses: SkillModifier[];
  
  // Equipment slots
  slots: EquipmentSlot[];
}
```

### Layer 2: World Overlay (Per-World)
Modifications applied by specific world/location. Does not travel with character.

```typescript
interface WorldCharacterOverlay {
  character_id: string;
  world_id: string;
  
  // Lore modifications for this world
  lore_overrides: LoreOverride[];    // "In this world, character is a thief"
  backstory_additions: string[];     // World-specific backstory
  relationship_overrides: RelationshipOverride[];
  
  // Skill modifications for this world
  skill_modifiers: SkillModifier[];  // +10 sword in this world
  unlocked_abilities: string[];      // Abilities only in this world
  
  // World-based attributes
  buffs: Buff[];                     // Active buffs in this world
  debuffs: Debuff[];                 // Active debuffs in this world
  status_effects: StatusEffect[];    // Poison, blessed, cursed, etc.
  
  // Karma & standing (per-world)
  karma: KarmaRecord;
  standings: StandingRecord[];
  world_views: WorldView[];          // Beliefs/opinions in this world
  
  // Location-specific
  location_bonuses: LocationBonus[];
  location_penalties: LocationPenalty[];
}
```

### Layer 3: Story Overlay (Per-Story/Session)
Temporary modifications for current story arc.

```typescript
interface StoryCharacterOverlay {
  character_id: string;
  story_id: string;
  session_id: string;
  
  // Story-specific changes
  temporary_traits: TemporaryTrait[];
  story_knowledge: string[];     // Things learned in this story
  story_relationships: StoryRelationship[];
  
  // Temporary stat changes
  temporary_buffs: Buff[];
  temporary_debuffs: Debuff[];
  
  // Story arc state
  arc_progress: ArcProgress;
  arc_decisions: ArcDecision[];
}
```

## Database Schema

```sql
-- Layer 0: Character Core
CREATE TABLE character_core (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  gender TEXT NOT NULL,
  age INTEGER NOT NULL,
  personality_traits JSON NOT NULL,
  core_values JSON NOT NULL,
  physique JSON NOT NULL,
  appearance JSON NOT NULL,
  base_stats JSON NOT NULL,
  base_skills JSON NOT NULL,
  creator_id TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  licensing JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Layer 1: Equipment
CREATE TABLE character_equipment (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character_core(id),
  slot TEXT NOT NULL,           -- 'head', 'torso', 'legs', 'feet', 'accessory1', etc.
  item_id TEXT NOT NULL,
  stat_bonuses JSON,
  skill_bonuses JSON,
  equipped_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(character_id, slot)
);

-- Layer 2: World Overlay
CREATE TABLE world_character_overlay (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character_core(id),
  world_id TEXT NOT NULL,
  lore_overrides JSON,
  skill_modifiers JSON,
  buffs JSON,
  debuffs JSON,
  karma JSON NOT NULL DEFAULT '{}',
  standings JSON NOT NULL DEFAULT '{}',
  world_views JSON NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(character_id, world_id)
);

-- Layer 3: Story Overlay
CREATE TABLE story_character_overlay (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character_core(id),
  story_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  temporary_traits JSON,
  story_knowledge JSON,
  temporary_buffs JSON,
  temporary_debuffs JSON,
  arc_progress JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(character_id, story_id, session_id)
);

-- Initial karma/standing defaults
CREATE TABLE character_defaults (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character_core(id),
  default_karma INTEGER NOT NULL DEFAULT 0,
  default_standings JSON NOT NULL DEFAULT '{}',
  default_world_views JSON NOT NULL DEFAULT '[]',
  initial_buffs JSON NOT NULL DEFAULT '[]',
  initial_debuffs JSON NOT NULL DEFAULT '[]',
  UNIQUE(character_id)
);
```

## Resolution Order

When querying character state, merge layers in order:
1. Character Core (base)
2. Equipment (current gear)
3. World Overlay (world-specific)
4. Story Overlay (story-specific)

Later layers override earlier ones. Equipment overrides core stats. World overrides equipment.

```typescript
function resolveCharacter(characterId: string, worldId: string, storyId?: string): ResolvedCharacter {
  const core = getCharacterCore(characterId);
  const equipment = getEquipment(characterId);
  const worldOverlay = getWorldOverlay(characterId, worldId);
  const storyOverlay = storyId ? getStoryOverlay(characterId, storyId) : null;
  
  return mergeLayers(core, equipment, worldOverlay, storyOverlay);
}
```

## Tasks

- [ ] Design layer architecture
- [ ] Design database schema for all 4 layers
- [ ] Implement Character Core CRUD
- [ ] Implement Equipment system
- [ ] Implement World Overlay CRUD
- [ ] Implement Story Overlay CRUD
- [ ] Implement layer resolution/merge logic
- [ ] Implement conflict detection between layers
- [ ] Implement undo/rollback for overlays
- [ ] Implement overlay diff viewing
- [ ] Implement character portability (export/import with overlays)
- [ ] Write tests for layer resolution
- [ ] Write tests for overlay merging
- [ ] Write tests for character portability

## Files

- `src/characters/core.ts` — Character Core CRUD
- `src/characters/equipment.ts` — Equipment system
- `src/characters/world-overlay.ts` — World Overlay CRUD
- `src/characters/story-overlay.ts` — Story Overlay CRUD
- `src/characters/resolver.ts` — Layer resolution/merge
- `src/characters/types.ts` — Type definitions
- `src/db/migrations/` — Schema migrations
