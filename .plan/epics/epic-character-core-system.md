# EPIC: Character Core System

**Status:** 🟡 Partial — character core services (traits, mood, relationships, avatars, licensing) + API/IO routes + tests complete; RPG stat system + template system in progress
**Priority:** High
**Effort:** High
**Type:** Foundation Epic
**Tags:** characters, stats, personality, core-system

## Summary

Core character data model and services — mandatory/optional fields, RPG stats, personality traits, validation, and the unified character API. Foundation for character generation, import, and all character-consuming systems.

## Reference

- Spec: `docs/spec/character-spec.md` (611 lines — authoritative)
- Spec: `docs/spec/character-interactions.md`
- Spec: `docs/spec/rpg-mechanics.md`

## Scope

- Mandatory fields: `name`, `description`, `personality`
- Optional fields: `nickname`, `scenario`, `welcome_message`, `mes_example`, `system_prompt`, `post_history_instructions`, `alternate_greetings`, `tags`, `creator`
- RPG stats (STR, DEX, CON, INT, WIS, CHA, etc.)
- Personality traits, bonds, flaws, ideals
- Character validation (field lengths, constraints)
- Unified character API

## Current State (verified 2026-08-04)

The unified character API is **implemented and wired** — no `TBD` remains in `src/routes/characters.ts`:

- `charactersRoutes` mounted at `src/elysia-app.ts:163`
- Full CRUD: `GET/POST /api/actors`, `GET /api/actors/:actorId`, `GET /api/actors/:actorId/card`, `PUT/DELETE /api/actors/:actorId`, `GET /api/actors/:actorId/export`, `POST /api/actors/import`
- Companion character sub-routes all wired: `character-traits`, `character-mood`, `character-relationships`, `character-avatars`, `character-emotions`, `character-emotion-avatars`, `character-availability`, `character-licensing`, `character-io` (each mounted in `elysia-app.ts`)
- Personality + traits services: `src/characters/services/personality-service.ts`, `traits-service.ts`
- RPG subsystem (dice, combat, achievements, crafting, encounters, spells) under `src/rpg/`
- Import/export per `epic-import-export-io.md`

## Tasks

- [x] Character validation schemas (field lengths, required fields) — TypeBox `src/validation/schemas.ts`
- [x] Personality trait system — `traits-service.ts` + `personality-service.ts`
- [x] Character CRUD API routes — `src/routes/characters.ts` (wired, tested)
- [x] Character search/filter — `GET /api/actors` with `page`/`pageSize`/`type` query
- [ ] RPG stat system (base stats, modifiers, derived stats) — `src/rpg/` partial (dice/combat exist)
- [ ] Character template system — pending prompt-template-registry work

## Files

- `src/db/schema-core.ts` — Actors table (shared with actor system)
- `src/routes/characters.ts` — character API (implemented, wired)
- `src/rpg/` — RPG stat calculations (partial: dice, combat, achievements, etc.)

## Acceptance Criteria

- [x] Character creation with mandatory fields validated
- [x] Optional fields with correct defaults
- [ ] RPG stats calculate correctly
- [x] Character API serves full character data
- [x] Tests passing

## Related Epics

- `epic-actors.md` — characters are actors; this epic focuses on character-specific fields
- `epic-assistant-gm-flows.md` — character generation targets this system
- `epic-rpg-mechanics.md` — stat system integration
- `epic-character-spec.md` — spec details
- `epic-achievements.md` — stat-based achievements depend on character stats

## Tickets

- `TASK-character-core-system.md` — implementation tasks

---

## Memory Architecture (Extension — Research-Driven)

Characters need structured memory to drive consistent, goal-directed behavior
across sessions. The four-tier memory architecture (from cognitive science and
production AI agent systems) provides the foundation:

### Four-Tier Memory Model

| Tier      | What it stores                          | Storage                | Retrieval rule                    | Lifetime        |
| --------- | --------------------------------------- | ---------------------- | --------------------------------- | --------------- |
| Working   | Current turn's context                  | In-process (prompt)    | Always in context                 | Seconds–minutes |
| Episodic  | Specific past events with timestamps    | Vector store + metadata| Similarity to current query       | Days–forever    |
| Semantic  | Extracted facts about user/world        | Relational schema      | Entity + relevance                | Forever, updated|
| Procedural| Learned routines and policies           | Versioned docs/DB      | Intent + role                     | Updated rarely  |

### Working Memory

The current turn's context window. Contains:
- System prompt + recent messages
- Current plan or sub-goals
- Intermediate results from tool calls
- Open approvals or interrupts
- Budget/step counter

**Does NOT contain:** anything that should survive restarts (→ episodic),
anything queryable later (→ semantic), anything describing how to work (→ procedural).

### Episodic Memory

Specific past events with timestamps. Examples:
- "Last Tuesday we discussed the API redesign"
- "Character A betrayed Character B in the dungeon"
- "The party defeated the dragon on turn 47"

**Storage:** Vector DB + metadata (timestamp, participants, location, emotional valence).
**Retrieval:** similarity search to current query + recency weighting.

### Semantic Memory

Extracted facts and preferences. Examples:
- "Character A trusts Character B (strength: 85)"
- "The merchant is secretly a thief"
- "Player prefers diplomatic solutions"

**Storage:** Relational schema (entity-attribute-value or structured JSON).
**Retrieval:** entity lookup + relevance scoring.

### Procedural Memory

Learned routines and policies. Examples:
- "When greeting a stranger, Character A bows formally"
- "In combat, Character B always protects the weakest party member"
- "When stressed, Character C withdraws and goes silent"

**Storage:** Versioned documents (git or DB).
**Retrieval:** intent matching + role filtering.

### Memory Consolidation

A background pipeline that runs during idle periods to:
1. **Merge** near-duplicate semantic facts
2. **Prune** low-importance episodic memories
3. **Strengthen** frequently accessed memories
4. **Abstract** patterns from episodic → semantic (e.g. "Character A has
   betrayed the party 3 times" → "Character A is untrustworthy")

```typescript
interface MemoryConsolidationConfig {
  enabled: boolean;
  run_interval_ms: number;        // how often to run (e.g. 60000 = 1 min)
  episodic_max_age_days: number;  // prune episodic memories older than this
  semantic_merge_threshold: number; // similarity threshold for merging facts
  abstraction_min_episodes: number; // min episodes before abstracting to semantic
}
```

### Integration with Character System

- **Episodic** memories are created from chat events, combat outcomes,
  relationship changes, and world events.
- **Semantic** facts are extracted from episodic memories by the consolidation
  pipeline and from explicit author input.
- **Procedural** routines are defined by the author (via personality, coping,
  approach) and refined by the consolidation pipeline.
- **Working** memory is assembled by the prompt builder from all three
  long-term tiers plus current context.

### Prompt Assembly

The prompt builder assembles working memory from:
1. **System prompt** (personality, internal traits, behavioral dimensions)
2. **Recent episodic** memories (last N events, weighted by recency + relevance)
3. **Semantic** facts (character relationships, world state, player preferences)
4. **Procedural** routines (behavioral patterns, coping strategies, approach tendencies)

### Schema (proposed)

```typescript
interface CharacterMemory {
  character_id: string;
  
  episodic: EpisodicMemory[];    // timestamped events
  semantic: SemanticFact[];      // extracted facts
  procedural: ProceduralRoutine[]; // learned behaviors
  
  consolidation: {
    last_run: Date;
    next_run: Date;
    config: MemoryConsolidationConfig;
  };
}

interface EpisodicMemory {
  id: string;
  timestamp: Date;
  event: string;               // what happened
  participants: string[];      // who was involved
  location?: string;           // where it happened
  emotional_valence: number;   // -100 (negative) to 100 (positive)
  importance: number;          // 0–100: how significant
  access_count: number;        // how often retrieved
  last_accessed: Date;
}

interface SemanticFact {
  id: string;
  subject: string;             // entity name
  predicate: string;           // relationship/attribute
  object: string;              // value
  confidence: number;          // 0–100: how certain
  source: "author" | "inferred" | "consolidated";
  last_updated: Date;
}

interface ProceduralRoutine {
  id: string;
  trigger: string;             // when this activates
  action: string;              // what to do
  priority: number;            // 0–100
  source: "author" | "learned";
  last_used: Date;
}
```

### Tasks

| Task | Description | Priority | Status |
|------|-------------|----------|--------|
| TASK-char-memory-schema | Add `CharacterMemory` types + `CanonicalCharacter` fields | High | Not Started |
| TASK-char-memory-db | Migration: memory tables (episodic, semantic, procedural) | High | Not Started |
| TASK-char-memory-consolidation | Background consolidation pipeline | Medium | Not Started |
| TASK-char-memory-prompt | Prompt assembly from all four memory tiers | High | Not Started |
| TASK-char-memory-api | CRUD routes for memory management | Medium | Not Started |
| TASK-char-memory-tests | Schema, consolidation, prompt, API tests | High | Not Started |

### Open Questions

1. Should episodic memories decay automatically, or only through consolidation?
2. How should semantic facts with conflicting confidence be resolved?
3. Should procedural routines be author-only, or can the system learn new ones?
4. How should memory consolidation interact with the mood system (emotional memories
   may be weighted differently)?
5. Should memory be per-character or shared across a party/world?

## Character Growth & Development (Extension — Research-Driven)

Characters evolve over time through experiences, challenges, and relationships.
This is distinct from personality (immutable) and mood (reactive state) — it is
the _trajectory_ of a character's development arc.

### Growth Dimensions

Characters can grow in multiple dimensions:

```typescript
interface CharacterGrowth {
  character_id: string;
  
  // Skill progression
  skills: SkillProgression[];
  
  // Personality maturation
  personality_development: PersonalityDevelopment;
  
  // Relationship evolution
  relationship_milestones: RelationshipMilestone[];
  
  // Achievement tracking
  achievements: Achievement[];
  
  // Growth history
  growth_events: GrowthEvent[];
}

interface SkillProgression {
  skill_id: string;
  skill_name: string;
  current_level: number;
  experience: number;
  experience_to_next_level: number;
  
  // Skill-specific modifiers
  modifiers: SkillModifier[];
  
  // Skill history
  level_ups: LevelUpEvent[];
}

interface PersonalityDevelopment {
  // Personality traits that have evolved
  evolved_traits: EvolvedTrait[];
  
  // Core values that have strengthened/weakened
  value_changes: ValueChange[];
  
  // Fears that have been overcome
  fears_overcome: FearOvercome[];
  
  // Desires that have been fulfilled
  desires_fulfilled: DesireFulfilled[];
}

interface EvolvedTrait {
  trait: string;
  original_intensity: number;  // 0–100
  current_intensity: number;   // 0–100
  evolution_events: string[];  // what caused the change
}
```

### Growth Events

Events that trigger character growth:

```typescript
interface GrowthEvent {
  id: string;
  character_id: string;
  timestamp: Date;
  event_type: GrowthEventType;
  description: string;
  
  // Growth impact
  skill_changes: Array<{
    skill_id: string;
    experience_gained: number;
  }>;
  
  personality_changes: Array<{
    trait: string;
    intensity_change: number;
  }>;
  
  // Narrative significance
  poignancy_score: number;     // 0–100: how significant
  memory_importance: number;   // 0–100: how memorable
}

type GrowthEventType =
  | "combat_victory"          // won a fight
  | "combat_defeat"           // lost a fight
  | "skill_use"               // successfully used a skill
  | "skill_failure"           // failed at a skill
  | "relationship_change"     // relationship evolved
  | "world_event"             // significant world event
  | "personal_challenge"      // faced a personal challenge
  | "moral_choice"            // made a moral decision
  | "loss"                    // lost something important
  | "discovery"               // discovered something new
  | "teaching"                // taught someone something
  | "learning"                // learned from someone
  | "sacrifice"               // made a sacrifice
  | "betrayal"                // experienced betrayal
  | "forgiveness"             // forgave or was forgiven
  | "achievement"             // accomplished a goal
  | "failure"                 // failed at a goal
  | "transformation"          // underwent significant change;
```

### Narrative Milestones

Significant growth thresholds that trigger story events:

```typescript
interface NarrativeMilestone {
  id: string;
  name: string;
  description: string;
  
  // Conditions
  conditions: {
    min_level?: number;
    required_skills?: string[];
    required_achievements?: string[];
    required_relationship_milestones?: string[];
    required_growth_events?: string[];
  };
  
  // Effects
  effects: {
    skill_unlocks?: string[];
    personality_changes?: PersonalityChange[];
    story_unlocks?: string[];
    dialogue_changes?: string[];
    behavior_changes?: string[];
  };
  
  // Narrative
  narrative_description: string;
  notification_message?: string;
}
```

### Character Arc Templates

Pre-defined character development arcs:

```typescript
interface CharacterArc {
  id: string;
  name: string;
  description: string;
  
  // Arc phases
  phases: CharacterArcPhase[];
  
  // Arc triggers
  triggers: {
    min_growth_events: number;
    required_milestones: string[];
    time_requirements?: number; // days
  };
}

interface CharacterArcPhase {
  name: string;
  description: string;
  
  // Phase effects
  personality_changes: PersonalityChange[];
  skill_bonuses: SkillBonus[];
  behavior_modifiers: BehaviorModifier[];
  
  // Phase transitions
  transition_conditions: {
    required_growth_events: string[];
    required_milestones: string[];
  };
}
```

### Integration with Memory System

Character growth events are stored in memory:

1. **Episodic memory** — growth events are stored as significant memories
2. **Semantic memory** — skill levels and personality traits are tracked
3. **Procedural memory** — new behaviors learned through growth are stored
4. **Working memory** — current growth state influences immediate behavior

### Prompt Assembly

When generating dialogue or behavior, the prompt includes:
1. **Current skill levels** — what the character is good at
2. **Personality development** — how their personality has evolved
3. **Recent growth events** — what they've experienced recently
4. **Active arcs** — what character arc they're currently in
5. **Milestone effects** — what behavior/dialogue changes are unlocked

### Tasks

| Task | Description | Priority | Status |
|------|-------------|----------|--------|
| TASK-char-growth-schema | Add `CharacterGrowth` types + `CanonicalCharacter` fields | High | Not Started |
| TASK-char-growth-events | Growth event system with typed events | High | Not Started |
| TASK-char-growth-milestones | Narrative milestone thresholds | Medium | Not Started |
| TASK-char-growth-arcs | Character arc templates and progression | Medium | Not Started |
| TASK-char-growth-memory | Integration with memory system | High | Not Started |
| TASK-char-growth-prompt | Prompt assembly for growth context | High | Not Started |
| TASK-char-growth-tests | Growth events, milestones, arcs, memory tests | High | Not Started |

### Open Questions

1. Should character growth be visible to players, or only noticeable through behavior?
2. How should NPCs handle conflicting growth events (positive and negative)?
3. Should narrative milestones be automatic, or require player/NPC action?
4. How should character growth scale with world size?
5. Should NPCs be able to have multiple character arcs simultaneously?

---

## Merged from `.plan/epics/epic-character-core-system.md`

# Feature: Character Template Seeding

**Status:** ✅ Implemented
**Epic:** 46 (Creative Studio) — related
**Files:** `src/config/sections/characters.ts`, `src/config/character-loader.ts`, `src/config/templates-loader.ts`, `src/characters/seed.ts`, `src/server.ts`

## Summary

Default character templates are automatically seeded on app start. Built-in defaults (6 characters) are always seeded; user character files from `configs/characters/` are merged by name. Supports hard IDs for deterministic test reseeding.

## Key Capabilities

### 1. Built-in Default Characters

Six characters shipped with the app:

| Character          | Genre         | Role                    | ID                       |
| ------------------ | ------------- | ----------------------- | ------------------------ |
| Elara Nightwhisper | Fantasy       | Guide/lore sage         | `tpl-elara-nightwhisper` |
| ARIA-7             | Sci-Fi        | AI companion            | `tpl-aria-7`             |
| Detective Morgan   | Modern        | Mystery solver          | `tpl-detective-morgan`   |
| Dr. Alexis Thorne  | Horror        | Paranormal investigator | `tpl-dr-thorne`          |
| Yuki Tanaka        | Slice of Life | Neighbor/friend         | `tpl-yuki-tanaka`        |
| Assistant          | Assistant     | Helpful AI              | `tpl-assistant`          |

### 2. Character File Loading

Characters can be defined in two ways:

**Single-character files** (`configs/characters/elara-nightwhisper.yaml`):

```yaml
id: "tpl-elara-nightwhisper"
name: "Elara Nightwhisper"
description: "An ancient elven sage..."
# ... other fields
```

**Multi-character files** (`configs/characters/group-fantasy-scifi.yaml`):

```yaml
templates:
  - name: "Character 1"
    description: "..."
  - name: "Character 2"
    description: "..."
```

### 3. Hard IDs for Test Reseeding

Characters can have deterministic IDs (`id: "tpl-elara-nightwhisper"`) for:

- Easy DB cleanup in tests
- Deterministic test fixtures
- Migration testing

### 4. Access Control

Each template supports:

- `visibility`: `"private"` | `"public"` — who can see the character
- `content_rating`: `"sfw"` | `"nsfw_*"` — content classification
- `target_roles`: `("admin" | "user" | "viewer" | "solo")[]` — which user roles can use

### 5. Admin Configuration

- `is_template`: Can be used as template for user-created characters
- `is_default`: Auto-add to new users' character list

## Configuration

### Built-in Defaults

Always seeded from `CHARACTERS_DEFAULTS` in `src/config/sections/characters.ts`.

### Character Files

Place `.yaml`, `.yml`, or `.toml` files in `configs/characters/`:

```yaml
# Single character
id: "tpl-my-character"
name: "My Character"
description: "A character description"
visibility: "public"
content_rating: "sfw"
target_roles: ["user", "admin"]
is_template: true
is_default: true
```

### Template Config Override

Also supported via `configs/templates/character.yaml`:

```yaml
merge: extend # extend | override | replace
templates:
  - name: "My Character"
    description: "..."
```

## Merge Logic

1. Load built-in `CHARACTERS_DEFAULTS.templates`
2. Load character files from `configs/characters/`
3. Load `configs/templates/character.yaml` (if exists)
4. Merge all by name (case-insensitive) — later sources override earlier
5. Seed merged list (idempotent — skip existing)

## Seeding Flow

1. `server.ts` calls `loadTemplateConfig()` → loads all templates including characters
2. `mergeCharacterTemplates()` merges built-in + template-loaded
3. `seedCharacterTemplates()` seeds merged list
4. For each template:
   - Check if exists by `display_name` + `owner_id`
   - If exists: skip
   - If not: insert with hard ID or generated ID

## Files

- `src/config/sections/characters.ts` — Config schema + built-in defaults
- `src/config/character-loader.ts` — Character file loader (configs/characters/)
- `src/config/templates-loader.ts` — Template loader with character support
- `src/config/schema.ts` — `CharactersConfig` interface
- `src/characters/seed.ts` — Seeder + merge function
- `src/server.ts` — Startup integration
- `configs/characters/*.yaml` — Example character files
- `configs/templates/character.example.yaml` — Example template config
- `.plan/tickets/TASK-character-template-seeding.md` — Task tracking
