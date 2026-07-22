# TASK: Character vs World Data Separation

**Epic:** Character Core System
**Priority:** High
**Effort:** Very High
**Status:** In Progress (services + routes done, needs validation)

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
  // Identity (immutable)
  id: string;
  name: string;
  species: string;
  gender: string;
  age: number;

  // Mandatory fields
  description: string; // Full character description/backstory
  personality: string; // Personality summary (immutable)

  // Optional fields
  nickname?: string;
  scenario?: string;
  welcome_message?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  creator_notes?: string;
  character_version?: string;

  // NSFW content rating
  content_rating: ContentRating;
  nsfw_categories: string[];
  nsfw_hard_limits: string[];

  // Permanent traits (immutable)
  permanent_traits: PermanentTraits;

  // Creator metadata
  creator_id: string;
  created_at: Date;
  visibility: CharacterVisibility;
  licensing: CharacterLicensing;
}

type ContentRating =
  | "sfw"
  | "nsfw_mild"
  | "nsfw_moderate"
  | "nsfw_intense"
  | "nsfw_extreme";
```

### Layer 1: Character Equipment (Current State)

Clothes, gear, items currently equipped. Can change freely.

```typescript
interface CharacterEquipment {
  character_id: string;

  // Visual overrides
  outfit: Outfit;
  accessories: Accessory[];
  hairstyle: Hairstyle;
  body_modifications: BodyModification[];

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

  // World traits (applied by world context)
  world_traits: WorldTraits;

  // Lore modifications for this world
  lore_overrides: LoreOverride[];
  backstory_additions: string[];
  relationship_overrides: RelationshipOverride[];

  // Skill modifications for this world
  skill_modifiers: SkillModifier[];
  unlocked_abilities: string[];

  // World-based attributes
  buffs: Buff[];
  debuffs: Debuff[];
  status_effects: StatusEffect[];

  // Karma & standing (per-world)
  karma: KarmaRecord;
  standings: StandingRecord[];
  world_views: WorldView[];

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
  story_knowledge: string[];
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
  description TEXT NOT NULL,
  personality TEXT NOT NULL,
  nickname TEXT,
  scenario TEXT,
  welcome_message TEXT,
  mes_example TEXT,
  system_prompt TEXT,
  post_history_instructions TEXT,
  alternate_greetings JSON NOT NULL DEFAULT '[]',
  tags JSON NOT NULL DEFAULT '[]',
  creator TEXT,
  creator_notes TEXT,
  character_version TEXT NOT NULL DEFAULT '1.0',
  content_rating TEXT NOT NULL DEFAULT 'sfw',
  nsfw_categories JSON NOT NULL DEFAULT '[]',
  nsfw_hard_limits JSON NOT NULL DEFAULT '[]',
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
  slot TEXT NOT NULL,
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
  world_traits JSON NOT NULL DEFAULT '{}',
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

-- Permanent traits (Layer 0)
CREATE TABLE character_permanent_traits (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character_core(id) UNIQUE,
  identity JSON NOT NULL DEFAULT '{}',      -- name, species, gender, age, birth_date
  personality JSON NOT NULL DEFAULT '{}',    -- traits, core_values, fears, desires, alignment, ideals, strives
  physical JSON NOT NULL DEFAULT '{}',       -- size, complexity, features, physique, natural_appearance, voice
  social JSON NOT NULL DEFAULT '{}',         -- friendliness, talkativity, activity_level, talk_style
  preferences JSON NOT NULL DEFAULT '{}',    -- food_preference, comfort_preference
  background JSON NOT NULL DEFAULT '{}',     -- homeland, culture, education, formative_events, secrets
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- World traits (Layer 2)
CREATE TABLE character_world_traits (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character_core(id),
  world_id TEXT NOT NULL REFERENCES worlds(id),
  environmental JSON NOT NULL DEFAULT '{}',  -- stat_modifiers, skill_modifiers, resistances, vulnerabilities
  cultural JSON NOT NULL DEFAULT '{}',        -- speech_patterns, behavioral_modifiers, social_norms, taboos
  magical JSON NOT NULL DEFAULT '{}',         -- abilities, restrictions, mana_modifier, magic_resistance
  social JSON NOT NULL DEFAULT '{}',          -- faction_standings, reputation, titles, notoriety
  equipment JSON NOT NULL DEFAULT '{}',       -- clothes, accessories, weapons, other_items (world-specific)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(character_id, world_id)
);

-- Location traits
CREATE TABLE character_location_traits (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character_core(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  world_id TEXT NOT NULL REFERENCES worlds(id),
  bonuses JSON NOT NULL DEFAULT '{}',        -- stat_modifiers, skill_modifiers, comfort_level, safety_level
  penalties JSON NOT NULL DEFAULT '{}',       -- stat_modifiers, skill_modifiers, discomfort, danger
  effects JSON NOT NULL DEFAULT '[]',         -- StatusEffect[]
  equipment_override JSON DEFAULT '{}',       -- clothes, accessories, weapons, other_items (location-specific)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(character_id, location_id)
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
function resolveCharacter(
  characterId: string,
  worldId: string,
  storyId?: string,
): ResolvedCharacter {
  const core = getCharacterCore(characterId,);
  const equipment = getEquipment(characterId,);
  const worldOverlay = getWorldOverlay(characterId, worldId,);
  const storyOverlay = storyId ? getStoryOverlay(characterId, storyId,) : null;

  return mergeLayers(core, equipment, worldOverlay, storyOverlay,);
}
```

## Tasks

### Phase 1: Schema & Core (Week 1-2)

- [ ] Design layer architecture
- [ ] Design database schema for all 4 layers
- [ ] Add NSFW content rating fields
- [ ] Add mandatory/optional field definitions
- [ ] Implement Character Core CRUD
- [ ] Implement Permanent Traits schema

### Phase 2: Equipment & Overlays (Week 2-3)

- [ ] Implement Equipment system
- [ ] Implement World Overlay CRUD
- [ ] Implement World Traits CRUD
- [ ] Implement Location Traits CRUD
- [ ] Implement Story Overlay CRUD

### Phase 3: Resolution & Merge (Week 3-4)

- [ ] Implement layer resolution/merge logic
- [ ] Implement personality integrity enforcement
- [ ] Implement conflict detection between layers
- [ ] Implement undo/rollback for overlays
- [ ] Implement overlay diff viewing

### Phase 4: Integration & Testing (Week 4-5)

- [ ] Implement character portability (export/import with overlays)
- [ ] Write tests for layer resolution
- [ ] Write tests for overlay merging
- [ ] Write tests for character portability

## Files

- `src/characters/core.ts` — Character Core CRUD
- `src/characters/equipment.ts` — Equipment system
- `src/characters/world-overlay.ts` — World Overlay CRUD
- `src/characters/world-traits.ts` — World Traits CRUD
- `src/characters/location-traits.ts` — Location Traits CRUD
- `src/characters/story-overlay.ts` — Story Overlay CRUD
- `src/characters/resolver.ts` — Layer resolution/merge
- `src/characters/types.ts` — Type definitions
- `src/db/migrations/` — Schema migrations

## Related

- TASK-character-personality-integrity.md — Personality is immutable (Layer 0)
- TASK-character-mood-happiness.md — Mood affects expression
- TASK-character-relationships.md — Per-world relationships
- TASK-character-multi-avatar.md — Context-aware avatars
- TASK-character-creator-prerogative.md — Availability and licensing
- epic-character-core-system.md — Parent epic
