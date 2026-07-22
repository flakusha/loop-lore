# TASK: Character Personality Integrity

**Epic:** Character Core System
**Priority:** High
**Effort:** Medium
**Status:** Not Started
**Supersedes:** TASK-character-multi-personality.md

## Summary

Enforce personality integrity — core personality traits are IMMUTABLE across worlds, stories, and sessions. No personality switching mechanics. World/story can modify behavioral expression but NOT the underlying personality.

## Core Principle

**Personality change is PROHIBITED.**

A character who is "wise, patient, aloof" in one world MUST be "wise, patient, aloof" in every world. What CAN change is how those traits are EXPRESSED based on context.

## What Changes vs What Doesn't

| What CAN Change (Expression)  | What CANNOT Change (Core)     |
| ----------------------------- | ----------------------------- |
| Mood (happiness level)        | Personality traits            |
| Emotional expression          | Core values                   |
| Behavioral modifiers          | Fears and desires             |
| Speech tone (formal/informal) | Temperament                   |
| Cooperation level             | Alignment                     |
| Quirk suppression (temporary) | Identity (name, species, age) |

## Design

### Immutable Personality (Layer 0)

```typescript
interface ImmutablePersonality {
  character_id: string;

  // Core traits — NEVER change
  traits: PersonalityTrait[]; // e.g., ["wise", "aloof", "patient"]
  core_values: string[]; // e.g., ["honesty", "knowledge"]
  fears: string[]; // e.g., ["fire", "betrayal"]
  desires: string[]; // e.g., ["understanding", "peace"]
  temperament: Temperament; // sanguine, choleric, melancholic, phlegmatic
  alignment?: string; // D&D-style or custom
  quirks: string[]; // e.g., ["hums when nervous"]

  // Creation metadata
  created_at: Date;
  locked_at: Date; // When personality was locked (creation time)
}
```

### Behavioral Modifiers (Layer 2 — World/Story)

Contextual modifiers that affect HOW personality is expressed, not WHAT it is:

```typescript
interface BehavioralModifier {
  id: string;
  character_id: string;
  world_id?: string; // null = global modifier
  story_id?: string; // null = world-wide modifier

  // What this modifier affects
  type: "speech" | "behavior" | "emotional" | "social" | "quirk_suppression";

  // Modifier details
  speech_override?: {
    formality: "formal" | "informal" | "childlike" | "scholarly" | "casual";
    vocabulary_override?: string[]; // Additional words, not replacement
    sentence_structure?: "simple" | "complex" | "fragmented" | "verbose";
    tone?: "friendly" | "hostile" | "neutral" | "playful" | "serious";
  };

  behavioral_override?: {
    cooperation_modifier: number; // -50 to +50
    warmth_modifier: number;
    humor_modifier: number;
    formality_modifier: number;
    risk_taking_modifier: number;
  };

  emotional_override?: {
    expressiveness: number; // 0-100 (how much emotion to show)
    emotional_range: number; // 0-100 (variety of emotions)
    suppression: string[]; // Emotions to suppress (e.g., ["fear", "vulnerability"])
  };

  quirk_suppression?: {
    suppressed_quirks: string[]; // Which quirks to hide in this context
    reason?: string; // "Professional setting requires decorum"
  };

  // Activation conditions
  conditions: ModifierCondition[];
  priority: number; // Higher = applied later (overrides lower)
}

interface ModifierCondition {
  type: "world" | "location" | "relationship" | "mood" | "time" | "custom";
  parameters: Record<string, unknown>;
}
```

### Personality Resolution

When resolving character personality:

1. Start with immutable personality (Layer 0)
2. Apply mood modifiers (affect expression, not traits)
3. Apply behavioral modifiers from world (Layer 2)
4. Apply behavioral modifiers from story (Layer 3)
5. Apply relationship-based modifiers

```typescript
function resolvePersonality(
  characterId: string,
  worldId: string,
  storyId?: string,
  context?: PersonalityContext,
): ResolvedPersonality {
  const immutable = getImmutablePersonality(characterId,);
  const mood = getMoodState(characterId,);
  const worldModifiers = getWorldModifiers(characterId, worldId,);
  const storyModifiers = storyId ? getStoryModifiers(characterId, storyId,) : [];
  const relationshipModifiers = context?.relationshipId
    ? getRelationshipModifiers(characterId, context.relationshipId,)
    : [];

  // Apply modifiers in order (later overrides earlier)
  const expression = applyModifiers(
    immutable,
    mood,
    worldModifiers,
    storyModifiers,
    relationshipModifiers,
  );

  return {
    // Core (immutable)
    traits: immutable.traits,
    core_values: immutable.core_values,
    fears: immutable.fears,
    desires: immutable.desires,
    temperament: immutable.temperament,
    alignment: immutable.alignment,

    // Expression (modified by context)
    tone: expression.tone,
    cooperation: expression.cooperation,
    warmth: expression.warmth,
    humor: expression.humor,
    formality: expression.formality,
    active_quirks: expression.active_quirks,
    suppressed_quirks: expression.suppressed_quirks,
  };
}
```

### World/Chat Personality Lock

World or chat configs can LOCK behavioral expression (but NOT change personality):

```typescript
interface PersonalityLock {
  character_id: string;
  context_id: string; // world_id or chat_id
  context_type: "world" | "chat";

  // What is locked
  locked_expression: {
    formality?: "formal" | "informal" | "childlike" | "scholarly" | "casual";
    cooperation_level?: number;
    warmth_level?: number;
    suppressed_quirks?: string[];
  };

  reason?: string; // "World requires professional demeanor"
  locked_by: string; // Who set the lock
  locked_at: Date;
}
```

**Lock rules:**

- Locks can only modify EXPRESSION, not core personality
- Locks can be overridden by higher-authority locks
- Locks can be temporary (with expiry) or permanent
- Admins can override any lock

### Validation Rules

Enforce personality integrity at creation and update:

```typescript
interface PersonalityValidation {
  // At creation
  validateCreation(personality: NewPersonality,): ValidationResult;

  // At update (forbids personality changes)
  validateUpdate(
    current: ImmutablePersonality,
    proposed: Partial<ImmutablePersonality>,
  ): ValidationResult;

  // At world import (forbids personality in imported data)
  validateImport(importedData: CharacterImport,): ValidationResult;
}

// Validation results
type ValidationResult =
  | { valid: true }
  | { valid: false; errors: PersonalityError[] };

interface PersonalityError {
  field: string;
  message: string;
  severity: "error" | "warning";
}
```

**Validation rules:**

1. Personality traits cannot be added, removed, or reordered after creation
2. Core values cannot be modified after creation
3. Fears and desires cannot be modified after creation
4. Temperament cannot be changed after creation
5. Imported character data with different personality → reject or warn
6. World/story imports cannot override personality fields

## Integration Points

### With Character Core (Layer 0)

Personality is part of immutable character core:

```typescript
interface CharacterCore {
  // ... other fields ...
  personality: ImmutablePersonality; // Part of Layer 0
}
```

### With Mood System

Mood affects expression, not personality:

```typescript
// Mood can modify expression
const moodModifier = {
  happiness: 30, // Sad
  tone: "negative", // Mood affects tone
  cooperation: -20, // Mood affects cooperation
  // But does NOT change:
  // - personality_traits
  // - core_values
  // - fears
  // - desires
};
```

### With World Overlay

World can add behavioral modifiers:

```typescript
// World can add modifiers
const worldModifier = {
  type: "speech",
  speech_override: {
    formality: "formal", // World requires formal speech
    // But does NOT change personality traits
  },
};
```

### With Chat Generation

Personality is injected into LLM prompt:

```
[Personality — {{char}}]
Core Traits: wise, patient, aloof
Core Values: honesty, knowledge, justice
Fears: fire, betrayal
Desires: understanding, peace
Temperament: melancholic
Alignment: Lawful Good

[Current Expression]
Tone: formal (world requirement)
Cooperation: 60/100 (mood: neutral)
Warmth: 30/100 (mood: slightly sad)
Active Quirks: collects coins, hums when nervous
Suppressed Quirks: none
```

## Tasks

### Phase 1: Schema & Core (Week 1)

- [ ] Create `character_permanent_traits` table
- [ ] Create `character_behavioral_modifiers` table
- [ ] Create `personality_locks` table
- [ ] Implement `ImmutablePersonality` interface
- [ ] Implement `BehavioralModifier` interface
- [ ] Add personality validation rules
- [ ] Update character creation to enforce personality lock

### Phase 2: Modifier System (Week 2)

- [ ] Implement behavioral modifier CRUD
- [ ] Implement world modifier application
- [ ] Implement story modifier application
- [ ] Implement relationship modifier application
- [ ] Implement personality lock mechanism
- [ ] Add modifier priority and conflict resolution

### Phase 3: Integration (Week 3)

- [ ] Integrate with mood system (expression modifiers)
- [ ] Integrate with character resolver (Layer 0 + modifiers)
- [ ] Integrate with chat generation (prompt injection)
- [ ] Add personality validation to import pipeline
- [ ] Add personality validation to API endpoints

### Phase 4: UI & Testing (Week 4)

- [ ] Add personality display in character editor (read-only)
- [ ] Add behavioral modifier editor
- [ ] Add personality lock UI
- [ ] Write unit tests for personality validation
- [ ] Write unit tests for modifier application
- [ ] Write integration tests for personality resolution

## Files to Create

- `src/characters/personality.ts` — Personality integrity enforcement
- `src/characters/behavioral-modifiers.ts` — Modifier CRUD and application
- `src/characters/personality-lock.ts` — Lock mechanism
- `src/characters/personality-validator.ts` — Validation rules
- `src/db/schema-personality.ts` — Personality tables
- `src/routes/personality.ts` — API endpoints
- `src/components/behavioral-modifier-editor.html` — UI component

## Files to Modify

- `src/db/schema-core.ts` — Add personality column types
- `src/db/migrations/` — New tables
- `src/characters/core.ts` — Personality integration
- `src/characters/resolver.ts` — Personality resolution
- `src/assistant/prompt/sections/` — Personality prompt injection
- `src/routes/characters.ts` — Personality validation
- `src/characters/parser.ts` — Import validation

## Risk

Medium — personality integrity is critical for character consistency. Validation must be strict but allow legitimate modifications (e.g., fixing typos in description). Need clear distinction between personality (immutable) and expression (mutable).

## Related

- TASK-character-world-data-separation.md — Layer 0 architecture
- TASK-character-mood-happiness.md — Mood affects expression
- TASK-character-relationships.md — Relationships affect expression
- epic-character-core-system.md — Parent epic
