# EPIC: Character Core System

**Status:** 📝 Draft
**Priority:** High
**Effort:** Very High
**Type:** Feature Epic
**Tags:** character, traits, personality, mood, relationships, licensing, avatars

## Summary

Consolidated character system improvements: mandatory/optional field definitions, NSFW content rating, permanent traits, world/location traits, personality integrity enforcement, mood & relationships, licensing (creator-controlled OR full public domain), and context-aware multi-avatar system with config extensibility.

## Scope

This epic consolidates character-related improvements scattered across multiple tickets. It provides the architectural foundation that other character features build on.

### In Scope

1. **Character Data Model** — mandatory vs optional fields, NSFW content rating, description transfer
2. **Permanent Traits** — immutable character traits that travel across worlds (Layer 0)
3. **World/Location Traits** — traits applied by world/location context (Layer 2)
4. **Personality Integrity** — PROHIBITION of personality change mechanics; core personality is immutable
5. **Mood System** — happiness meter with personality expression modifiers
6. **Relationships** — inter-character bonds affecting dialogue and story
7. **Licensing** — creator/admin managed OR full public domain (CC0)
8. **Multi-Avatar System** — context/mood/action-aware avatars with config extensibility

### Out of Scope

- RPG mechanics (stats, combat, skills) → `epic-rpg-mechanics.md`
- Import/export formats → `epic-import-export-io.md` (coordinate for character fields)
- 3D avatars → `TASK-3d-view-modes.md`
- Emotion detection pipeline → `TASK-emotion-intent-detection.md` (separate but related)

---

## 1. Character Data Model

### Mandatory Fields (Required for All Characters)

| Field         | Type   | Description                          |
| ------------- | ------ | ------------------------------------ |
| `name`        | string | Character display name               |
| `description` | string | Full character description/backstory |
| `personality` | string | Personality summary (immutable)      |

### Optional Fields

| Field                       | Type     | Default | Description                     |
| --------------------------- | -------- | ------- | ------------------------------- |
| `nickname`                  | string   | null    | Alternative name                |
| `scenario`                  | string   | ""      | RP setting/context              |
| `welcome_message`           | string   | ""      | First message to user           |
| `mes_example`               | string   | ""      | Example dialogue                |
| `system_prompt`             | string   | ""      | System prompt override          |
| `post_history_instructions` | string   | ""      | Instructions after chat history |
| `alternate_greetings`       | string[] | []      | Alternative welcome messages    |
| `tags`                      | string[] | []      | Classification tags             |
| `creator`                   | string   | ""      | Creator name                    |
| `creator_notes`             | string   | ""      | Creator notes                   |
| `character_version`         | string   | "1.0"   | Creator's version string        |

### NSFW Content Rating

| Field              | Type     | Default | Description             |
| ------------------ | -------- | ------- | ----------------------- |
| `content_rating`   | enum     | "sfw"   | Content classification  |
| `nsfw_categories`  | string[] | []      | Allowed NSFW categories |
| `nsfw_hard_limits` | string[] | []      | Never-allowed content   |

Content rating values:

- `"sfw"` — Safe for work, no adult content
- `"nsfw_mild"` — Mild adult themes (romance, mild violence)
- `"nsfw_moderate"` — Moderate adult content (explicit violence, strong language)
- `"nsfw_intense"` — Intense adult content (sexual content, graphic violence)
- `"nsfw_extreme"` — Extreme adult content (no restrictions)

### Description Transfer

Characters can transfer descriptions between each other:

```typescript
interface DescriptionTransfer {
  source_character_id: string;
  target_character_id: string;
  transfer_type: "copy" | "merge" | "append";
  fields: string[]; // Which fields to transfer
  overwrite: boolean; // Replace existing or merge
}
```

Use cases:

- Clone character with modified description
- Merge descriptions from multiple sources
- Import description from external system
- Backup/restore description variants

---

## 2. Permanent Traits (Layer 0)

Traits set at character creation that NEVER change across worlds, stories, or sessions.

### Trait Categories

| Category        | Traits                                                                                                       | Mutability |
| --------------- | ------------------------------------------------------------------------------------------------------------ | ---------- |
| **Identity**    | name, species, gender, age, birth_date                                                                       | Immutable  |
| **Personality** | personality_traits, core_values, fears, desires, alignment, ideals, strives                                  | Immutable  |
| **Physical**    | size, complexity, features, physique, natural_appearance ("birthday suit"), voice, body_modifications        | Immutable  |
| **Social**      | friendliness, talkativity, activity_level, talk_style (basic — shifted by world stylistic requirements/lore) | Immutable  |
| **Preferences** | food_preference, comfort_preference                                                                          | Immutable  |
| **Background**  | homeland, culture, languages, education                                                                      | Immutable  |

### Permanent Trait Schema

```typescript
interface PermanentTraits {
  // Identity (immutable)
  identity: {
    name: string;
    species: string;
    gender: string;
    age: number;
    birth_date?: string;
    homeland?: string;
    culture?: string;
    languages: string[];
  };

  // Personality (immutable — PROHIBITS personality change)
  personality: {
    traits: PersonalityTrait[]; // e.g., ["wise", "aloof", "patient"]
    core_values: string[]; // e.g., ["honesty", "knowledge", "justice"]
    fears: string[]; // e.g., ["fire", "betrayal"]
    desires: string[]; // e.g., ["understanding", "peace"]
    alignment?: string; // D&D-style or custom
    ideals: string[]; // e.g., ["protect the innocent", "seek truth"]
    strives: string[]; // e.g., ["become a great healer", "find lost family"]
  };

  // Physical (immutable base — equipment overrides appearance)
  physical: {
    size: string; // e.g., "small", "medium", "large", "towering"
    complexity: string; // e.g., "simple", "humanoid", "exotic"
    features: string[]; // e.g., ["pointed ears", "glowing eyes"]
    physique: PhysiqueProfile;
    natural_appearance: AppearanceProfile; // "birthday suit" — base before clothing
    voice: VoiceProfile;
    body_modifications: string[]; // Birth marks, birth defects
  };

  // Social (immutable behavioral tendencies)
  social: {
    friendliness: number; // 0-100 (0=reclusive, 100=extremely friendly)
    talkativity: number; // 0-100 (0=silent, 100=non-stop talker)
    activity_level: number; // 0-100 (0=couch potato, 100=hyperactive)
    talk_style: TalkStyle; // basic style — can be SHIFTED by world stylistic requirements
  };

  // Preferences (immutable)
  preferences: {
    food_preference?: string; // e.g., "omnivore", "vegetarian", "carnivore", "sweets"
    comfort_preference?: string; // e.g., "warm fires", "outdoor sleeping", "fine silks"
  };

  // Background (immutable history)
  background: {
    homeland: string;
    culture: string;
    education: string[];
    formative_events: string[];
    secrets: string[]; // Hidden backstory elements
  };
}

// Talk style is immutable but can be SHIFTED by world stylistic requirements
// e.g., a character who normally speaks casually might use formal speech in a royal court
type TalkStyle = "casual" | "formal" | "scholarly" | "street" | "poetic" | "terse" | "flowery";
```

### Personality Integrity Enforcement

**CRITICAL DESIGN DECISION: Personality change is PROHIBITED.**

The multi-personality system does NOT allow switching between personalities. Core personality is immutable. What CAN change:

| What Changes           | What Does NOT Change |
| ---------------------- | -------------------- |
| Mood (happiness level) | Personality traits   |
| Emotional expression   | Core values          |
| Behavioral modifiers   | Fears and desires    |
| Speech tone            | Temperament          |
| Cooperation level      | Alignment            |

**World/story CAN:**

- Lock personality expression (suppress certain traits)
- Add behavioral modifiers (e.g., "in this world, she is more cautious")
- Override speech patterns (formal vs informal)
- Suppress quirks temporarily

**World/story CANNOT:**

- Change personality traits (wise → foolish)
- Alter core values (honest → deceptive)
- Modify fears or desires
- Change temperament or alignment

This ensures character consistency across worlds while allowing contextual expression.

---

## 3. World/Location Traits (Layer 2)

Traits applied by world/location context. Override or modify base character within specific contexts.

### World Trait Categories

| Category          | Description                     | Example                       |
| ----------------- | ------------------------------- | ----------------------------- |
| **Environmental** | Location-based modifiers        | +cold resistance in arctic    |
| **Cultural**      | Social norms and expectations   | Formal speech in court        |
| **Magical**       | World-specific abilities        | Fire magic in volcanic world  |
| **Social**        | Faction standing and reputation | Enemy of the Dark Brotherhood |
| **Equipment**     | Items carried in this world     | Sword, armor, accessories     |

### World Trait Schema

```typescript
interface WorldTraits {
  character_id: string;
  world_id: string;

  // Environmental modifiers
  environmental: {
    stat_modifiers: StatModifier[];
    skill_modifiers: SkillModifier[];
    resistances: string[];
    vulnerabilities: string[];
  };

  // Cultural overrides
  cultural: {
    speech_patterns: SpeechPattern[];
    behavioral_modifiers: BehavioralModifier[];
    social_norms: string[];
    taboos: string[];
  };

  // Magical modifiers
  magical: {
    abilities: string[];
    restrictions: string[];
    mana_modifier: number;
    magic_resistance: number;
  };

  // Social standing
  social: {
    faction_standings: FactionStanding[];
    reputation: number;
    titles: string[];
    notoriety: number;
  };

  // Equipment (world-specific items — NOT permanent traits)
  equipment: {
    clothes: Item[]; // e.g., ["royal gown", "leather boots"]
    accessories: Item[]; // e.g., ["magic amulet", "signet ring"]
    weapons: Item[]; // e.g., ["longsword", "staff of fire"]
    other_items: Item[]; // e.g., ["travel pack", "lockpicks"]
  };
}
```

### Location-Specific Traits

```typescript
interface LocationTraits {
  character_id: string;
  location_id: string;
  world_id: string;

  // Location bonuses
  bonuses: {
    stat_modifiers: StatModifier[];
    skill_modifiers: SkillModifier[];
    comfort_level: number; // 0-100
    safety_level: number; // 0-100
  };

  // Location penalties
  penalties: {
    stat_modifiers: StatModifier[];
    skill_modifiers: SkillModifier[];
    discomfort: number; // 0-100
    danger: number; // 0-100
  };

  // Location-specific effects
  effects: StatusEffect[];

  // Location-specific equipment (e.g., wearing armor in dungeon, swimsuit at beach)
  equipment_override?: {
    clothes?: Item[];
    accessories?: Item[];
    weapons?: Item[];
    other_items?: Item[];
  };
}
```

---

## 4. Mood System

Happiness meter affecting personality expression (not personality itself).

### Happiness Meter

| Range  | Label     | Expression Impact                             |
| ------ | --------- | --------------------------------------------- |
| 0-20   | Depressed | Withdrawn, negative tone, reduced cooperation |
| 21-40  | Sad       | Less enthusiastic, shorter responses          |
| 41-60  | Neutral   | Baseline expression                           |
| 61-80  | Happy     | More enthusiastic, cooperative                |
| 81-100 | Joyful    | Exuberant, takes risks, shares freely         |

### Mood-Expression Mapping

Mood modifies HOW personality is expressed, NOT WHAT personality is:

```typescript
interface MoodExpressionModifier {
  mood_level: number; // 0-100

  // Expression modifiers (NOT personality changes)
  tone: "negative" | "neutral" | "positive";
  verbosity: "minimal" | "normal" | "verbose";
  cooperation: number; // 0-100
  warmth: number; // 0-100
  humor: number; // 0-100
  formality: number; // 0-100

  // What mood CANNOT change
  // - personality_traits
  // - core_values
  // - fears
  // - desires
  // - temperament
}
```

### Mood Triggers

| Trigger              | Effect         | Notes                              |
| -------------------- | -------------- | ---------------------------------- |
| Positive events      | +happiness     | Success, praise, gifts, bonding    |
| Negative events      | -happiness     | Failure, criticism, loss, conflict |
| Time decay           | Toward neutral | Natural drift toward baseline      |
| Relationship changes | Variable       | Friendship, romance, betrayal      |
| World events         | Variable       | Cataclysms, prosperity, war        |

---

## 5. Relationships

Inter-character bonds affecting dialogue, story, and group dynamics.

### Relationship Schema

```typescript
interface CharacterRelationship {
  id: string;
  from_actor_id: string;
  to_actor_id: string;
  world_id: string; // Relationships are per-world

  // Core relationship
  type: RelationshipType;
  strength: number; // -100 to +100 (negative = antagonistic)
  description?: string; // "Childhood friends", "Sworn enemies"

  // Interaction tracking
  last_interaction_at: Date;
  interaction_count: number;
  positive_interactions: number;
  negative_interactions: number;

  // Context
  context: string; // How they met, shared history
  secrets_known: string[]; // What each knows about the other
}

type RelationshipType =
  | "ally"
  | "rival"
  | "family"
  | "romantic"
  | "mentor"
  | "student"
  | "enemy"
  | "neutral"
  | "acquaintance"
  | "custom";
```

### Relationship Tiers

| Tier       | Range    | Effect                                     |
| ---------- | -------- | ------------------------------------------ |
| Hostile    | -100–-51 | Attack on sight, refuse cooperation        |
| Unfriendly | -50–-21  | Cold, suspicious, limited interaction      |
| Neutral    | -20–+20  | Default, no strong feelings                |
| Friendly   | +21–+50  | Cooperative, willing to help               |
| Allied     | +51–+75  | Deep trust, share resources freely         |
| Devoted    | +76–+100 | Unconditional loyalty, sacrifice for other |

---

## 6. Licensing

Creator-controlled OR full public domain with no limits.

### License Types

```typescript
type LicenseType =
  // Creator-controlled
  | "all_rights" // Default — no sharing
  | "cc_by" // Creative Commons Attribution
  | "cc_by_sa" // CC Attribution-ShareAlike
  | "cc_by_nc" // CC Attribution-NonCommercial
  | "cc_by_nc_sa" // CC Attribution-NonCommercial-ShareAlike
  | "cc_by_nd" // CC Attribution-NoDerivs
  | "cc_by_nc_nd" // CC Attribution-NonCommercial-NoDerivs
  | "custom" // Custom license terms
  // Full public domain
  | "cc0" // Public domain, no restrictions
  | "public_domain"; // Explicit public domain declaration
```

### Admin Management

Admins can:

- Override character visibility (force private/public)
- Approve/reject character submissions
- Manage licensing disputes
- Set system-wide content policies
- Ban characters violating terms

```typescript
interface AdminCharacterManagement {
  admin_id: string;
  character_id: string;
  action: "visibility_override" | "license_override" | "ban" | "approve" | "restrict";
  reason: string;
  timestamp: Date;
  expires_at?: Date; // Temporary restrictions
}
```

---

## 7. Multi-Avatar System

Context/mood/action-aware avatars with config extensibility.

### Avatar Schema

```typescript
interface CharacterAvatar {
  id: string;
  character_id: string;
  asset_id: string; // Reference to assets table

  // Context tags
  emotion?: string; // "happy", "sad", "angry", etc.
  mood?: string; // "neutral", "stressed", "relaxed"
  action?: string; // "fighting", "sleeping", "eating"
  location?: string; // "forest", "city", "dungeon"
  time_of_day?: string; // "morning", "evening", "night"
  outfit?: string; // "armor", "casual", "formal"

  // Priority
  priority: number; // Higher = preferred when multiple match
  is_default: boolean; // Fallback avatar
}
```

### Avatar Selection Rules (Configurable)

```typescript
interface AvatarSelectionConfig {
  character_id: string;

  // Selection strategy
  strategy: "emotion_first" | "mood_first" | "action_first" | "context_first" | "weighted";

  // Weight configuration
  weights: {
    emotion: number; // 0-100, importance of emotion match
    mood: number;
    action: number;
    location: number;
    time_of_day: number;
    outfit: number;
  };

  // Fallback rules
  fallback_chain: AvatarFallbackRule[];
  default_avatar_id: string;
}

interface AvatarFallbackRule {
  condition: string; // "no_emotion_match", "no_mood_match", etc.
  action: "use_default" | "use_nearest" | "use_previous" | "generate";
}
```

### Config Extensibility

Avatar selection rules are configurable per-character and per-world:

```typescript
interface WorldAvatarConfig {
  world_id: string;

  // Global avatar rules
  enable_context_avatars: boolean;
  enable_mood_avatars: boolean;
  enable_action_avatars: boolean;

  // Custom avatar tags
  custom_tags: string[]; // User-defined context tags

  // Avatar generation
  auto_generate_missing: boolean; // Generate avatars for missing contexts
  generation_model?: string; // Which model to use for generation
}
```

---

## Integration Points

### With Existing Systems

| System                 | Integration                                       |
| ---------------------- | ------------------------------------------------- |
| **Import/Export**      | Character fields mapped in import/export pipeline |
| **RPG Mechanics**      | Permanent traits feed into stats system           |
| **World & Locations**  | World traits applied per-world context            |
| **Social Interaction** | Relationships affect social skill checks          |
| **Memory System**      | Memories filtered by relationship and mood        |
| **Chat Generation**    | Mood and relationships injected into prompt       |
| **Asset System**       | Avatars linked via asset_links                    |
| **Plugin System**      | Custom traits and modifiers via plugins           |

### With Other Tasks

| Task                                   | Relationship                                  |
| -------------------------------------- | --------------------------------------------- |
| `TASK-character-world-data-separation` | Foundation for Layer 0/2 architecture         |
| `TASK-character-multi-personality`     | REWRITTEN → personality integrity enforcement |
| `TASK-character-mood-happiness`        | Mood system, expression modifiers             |
| `TASK-character-relationships`         | Relationship system                           |
| `TASK-character-creator-prerogative`   | Licensing and availability                    |
| `TASK-emotions-avatar-edit-model`      | Multi-avatar system foundation                |
| `TASK-emotion-intent-detection`        | Emotion detection for avatar selection        |
| `TASK-character-memory-injection`      | Memory injection filtered by relationships    |

---

## Implementation Phases

### Phase 1: Data Model Foundation (Week 1-2)

1. Define mandatory/optional fields in schema
2. Add NSFW content rating fields
3. Implement permanent traits schema
4. Add description transfer mechanism
5. Update character CRUD to handle new fields

**Files:**

- `src/db/migrations/` — New columns for NSFW, content rating
- `src/characters/types.ts` — Permanent traits interfaces
- `src/characters/core.ts` — Core CRUD with new fields
- `src/routes/characters.ts` — Updated API endpoints

### Phase 2: Personality Integrity (Week 2-3)

1. Enforce personality immutability in Layer 0
2. Implement world/story behavioral modifiers
3. Add speech pattern overrides
4. Create personality lock mechanism

**Files:**

- `src/characters/personality.ts` — Personality integrity enforcement
- `src/characters/behavioral-modifiers.ts` — World/story modifiers
- `src/characters/resolver.ts` — Layer resolution with personality rules

### Phase 3: World/Location Traits (Week 3-4)

1. Implement world traits schema
2. Add location-specific traits
3. Create trait application pipeline
4. Integrate with character resolution

**Files:**

- `src/characters/world-traits.ts` — World trait CRUD
- `src/characters/location-traits.ts` — Location trait CRUD
- `src/characters/trait-resolver.ts` — Trait application logic

### Phase 4: Mood & Relationships (Week 4-5)

1. Implement mood meter with expression modifiers
2. Add relationship tracking
3. Integrate mood with personality expression
4. Integrate relationships with dialogue generation

**Files:**

- `src/characters/mood.ts` — Mood meter and triggers
- `src/characters/relationships.ts` — Relationship CRUD
- `src/characters/mood-expression.ts` — Mood-to-expression mapping

### Phase 5: Licensing & Avatars (Week 5-6)

1. Implement full licensing system with CC0
2. Add admin management controls
3. Implement multi-avatar schema
4. Add avatar selection rules and config

**Files:**

- `src/characters/licensing.ts` — Licensing CRUD
- `src/characters/admin-management.ts` — Admin controls
- `src/characters/avatars.ts` — Multi-avatar CRUD
- `src/characters/avatar-selector.ts` — Avatar selection logic

### Phase 6: Integration & Testing (Week 6-7)

1. Wire all systems into character resolution
2. Add UI components for new features
3. Write comprehensive tests
4. Update documentation

**Files:**

- `src/characters/resolver.ts` — Final integration
- `src/views/character-editor.html` — Updated UI
- `src/components/` — New UI components
- Tests across all new modules

---

## Database Schema Additions

### New Columns on `actors` Table

```sql
-- NSFW content rating
ALTER TABLE actors ADD COLUMN content_rating TEXT NOT NULL DEFAULT 'sfw';
ALTER TABLE actors ADD COLUMN nsfw_categories JSON NOT NULL DEFAULT '[]';
ALTER TABLE actors ADD COLUMN nsfw_hard_limits JSON NOT NULL DEFAULT '[]';

-- Description transfer tracking
ALTER TABLE actors ADD COLUMN description_source TEXT; -- Where description came from
ALTER TABLE actors ADD COLUMN description_version INTEGER NOT NULL DEFAULT 1;
```

### New Tables

```sql
-- Permanent traits (Layer 0)
CREATE TABLE character_permanent_traits (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES actors(id) UNIQUE,
  identity JSON NOT NULL DEFAULT '{}',
  personality JSON NOT NULL DEFAULT '{}',
  physical JSON NOT NULL DEFAULT '{}',
  background JSON NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- World traits (Layer 2)
CREATE TABLE character_world_traits (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES actors(id),
  world_id TEXT NOT NULL REFERENCES worlds(id),
  environmental JSON NOT NULL DEFAULT '{}',
  cultural JSON NOT NULL DEFAULT '{}',
  magical JSON NOT NULL DEFAULT '{}',
  social JSON NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(character_id, world_id)
);

-- Location traits
CREATE TABLE character_location_traits (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES actors(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  world_id TEXT NOT NULL REFERENCES worlds(id),
  bonuses JSON NOT NULL DEFAULT '{}',
  penalties JSON NOT NULL DEFAULT '{}',
  effects JSON NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(character_id, location_id)
);

-- Mood state
CREATE TABLE character_mood (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES actors(id) UNIQUE,
  happiness INTEGER NOT NULL DEFAULT 50,
  mood_history JSON NOT NULL DEFAULT '[]',
  mood_preferences JSON NOT NULL DEFAULT '{}',
  last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Relationships
CREATE TABLE character_relationships (
  id TEXT PRIMARY KEY,
  from_actor_id TEXT NOT NULL REFERENCES actors(id),
  to_actor_id TEXT NOT NULL REFERENCES actors(id),
  world_id TEXT NOT NULL REFERENCES worlds(id),
  type TEXT NOT NULL DEFAULT 'neutral',
  strength INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  context TEXT,
  secrets_known JSON NOT NULL DEFAULT '[]',
  interaction_count INTEGER NOT NULL DEFAULT 0,
  positive_interactions INTEGER NOT NULL DEFAULT 0,
  negative_interactions INTEGER NOT NULL DEFAULT 0,
  last_interaction_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(from_actor_id, to_actor_id, world_id)
);

-- Multi-avatar system
CREATE TABLE character_avatars (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES actors(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  emotion TEXT,
  mood TEXT,
  action TEXT,
  location TEXT,
  time_of_day TEXT,
  outfit TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(character_id, asset_id)
);

-- Avatar selection config
CREATE TABLE character_avatar_config (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES actors(id) UNIQUE,
  strategy TEXT NOT NULL DEFAULT 'emotion_first',
  weights JSON NOT NULL DEFAULT '{}',
  fallback_chain JSON NOT NULL DEFAULT '[]',
  default_avatar_id TEXT REFERENCES character_avatars(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Licensing (extends existing character availability)
CREATE TABLE character_licensing (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES actors(id) UNIQUE,
  license TEXT NOT NULL DEFAULT 'all_rights',
  attribution JSON NOT NULL DEFAULT '{}',
  derivatives JSON NOT NULL DEFAULT '{}',
  commercial JSON NOT NULL DEFAULT '{}',
  admin_overrides JSON NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Description transfer log
CREATE TABLE description_transfers (
  id TEXT PRIMARY KEY,
  source_character_id TEXT NOT NULL REFERENCES actors(id),
  target_character_id TEXT NOT NULL REFERENCES actors(id),
  transfer_type TEXT NOT NULL,
  fields JSON NOT NULL,
  overwrite INTEGER NOT NULL DEFAULT 0,
  transferred_by TEXT NOT NULL,
  transferred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Open Questions

1. **Personality Lock Scope:** Should personality locks be per-world, per-chat, or per-session?
2. **Mood Decay Rate:** How fast should happiness drift toward neutral? (Configurable per world?)
3. **Relationship Symmetry:** Should A→B relationship imply B→A, or allow asymmetric?
4. **Avatar Generation:** Should missing avatars be auto-generated or manually uploaded?
5. **License Migration:** How to handle characters imported with different license systems?
6. **Admin Override Limits:** Should admins be able to override ANY license, or only in specific cases?

---

## Files

### New Files

- `src/characters/core.ts` — Character Core CRUD (update)
- `src/characters/personality.ts` — Personality integrity enforcement
- `src/characters/world-traits.ts` — World trait CRUD
- `src/characters/location-traits.ts` — Location trait CRUD
- `src/characters/mood.ts` — Mood meter and triggers
- `src/characters/relationships.ts` — Relationship CRUD
- `src/characters/licensing.ts` — Licensing CRUD
- `src/characters/avatars.ts` — Multi-avatar CRUD
- `src/characters/avatar-selector.ts` — Avatar selection logic
- `src/characters/description-transfer.ts` — Description transfer mechanism
- `src/db/schema-characters.ts` — Character-specific schema types
- `src/routes/character-relationships.ts` — Relationship API
- `src/routes/character-avatars.ts` — Avatar API

### Modified Files

- `src/db/migrations/` — New tables and columns
- `src/db/schema-core.ts` — New column types
- `src/characters/types.ts` — Extended type definitions
- `src/characters/resolver.ts` — Layer resolution with new systems
- `src/routes/characters.ts` — Updated API endpoints
- `src/views/character-editor.html` — New UI sections
- `src/components/` — New UI components

### Test Files

- `src/characters/personality.test.ts`
- `src/characters/mood.test.ts`
- `src/characters/relationships.test.ts`
- `src/characters/avatar-selector.test.ts`
- `src/characters/licensing.test.ts`
- `src/characters/description-transfer.test.ts`

---

## References

- `docs/spec/character-setup.md` — Character system overview
- `docs/spec/actors.md` — Actor data model
- `docs/spec/schema.md` — Database schema
- `.plan/tickets/TASK-character-world-data-separation.md` — Layer architecture
- `.plan/tickets/TACK-character-multi-personality.md` — Rewritten → personality integrity
- `.plan/tickets/TASK-character-mood-happiness.md` — Mood system
- `.plan/tickets/TASK-character-relationships.md` — Relationship system
- `.plan/tickets/TASK-character-creator-prerogative.md` — Licensing
- `.plan/tickets/TASK-emotions-avatar-edit-model.md` — Avatar system
- `.plan/tickets/TASK-emotion-intent-detection.md` — Emotion detection
