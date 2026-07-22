# TASK: Character Mood & Expression System

**Epic:** Character Core System
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started

## Summary

Happiness meter affecting character expression. Mood modifies HOW personality is expressed, NOT WHAT personality is. Integrates with relationships, world context, and avatar selection.

## Core Principle

**Mood changes expression, NOT personality.**

A "wise, patient" character who is sad will express wisdom more quietly and patience more strained — but they remain wise and patient.

## Design

### Happiness Meter

| Range  | Label     | Expression Impact                             |
| ------ | --------- | --------------------------------------------- |
| 0-20   | Depressed | Withdrawn, negative tone, reduced cooperation |
| 21-40  | Sad       | Less enthusiastic, shorter responses          |
| 41-60  | Neutral   | Baseline expression                           |
| 61-80  | Happy     | More enthusiastic, cooperative                |
| 81-100 | Joyful    | Exuberant, takes risks, shares freely         |

### Mood State

```typescript
interface MoodState {
  character_id: string;

  // Current state
  happiness: number; // 0-100
  mood_label: MoodLabel;
  mood_stability: number; // 0-100 (higher = slower changes)
  recovery_rate: number; // Happiness recovered per turn

  // History
  mood_history: MoodEvent[];
  baseline_happiness: number; // Natural resting point
}

type MoodLabel =
  | "depressed"
  | "melancholy"
  | "neutral"
  | "content"
  | "happy"
  | "joyful"
  | "affectionate"
  | "playful"
  | "stressed"
  | "angry"
  | "anxious";

interface MoodEvent {
  timestamp: Date;
  happiness_change: number;
  trigger: MoodTrigger;
  reason: string;
}

type MoodTrigger =
  | "positive_event"
  | "negative_event"
  | "time_decay"
  | "relationship_change"
  | "world_event"
  | "location_change"
  | "manual_adjustment";
```

### Expression Modifiers

Mood affects expression dimensions:

```typescript
interface MoodExpressionModifier {
  mood_level: number; // 0-100

  // Expression dimensions (0-100 each)
  tone: number; // 0=negative, 50=neutral, 100=positive
  verbosity: number; // 0=minimal, 50=normal, 100=verbose
  cooperation: number; // 0=refuse, 50=neutral, 100=eager
  warmth: number; // 0=cold, 50=neutral, 100=affectionate
  humor: number; // 0=serious, 50=neutral, 100=playful
  formality: number; // 0=casual, 50=neutral, 100=formal
  expressiveness: number; // 0=stoic, 50=neutral, 100=dramatic
  risk_taking: number; // 0=cautious, 50=neutral, 100=reckless

  // What mood CANNOT change (enforced by personality integrity)
  // - personality_traits
  // - core_values
  // - fears
  // - desires
  // - temperament
}
```

### Mood Triggers & Effects

| Trigger             | Effect         | Range  | Notes                              |
| ------------------- | -------------- | ------ | ---------------------------------- |
| Positive event      | +happiness     | +5-20  | Success, praise, gifts, bonding    |
| Negative event      | -happiness     | -5-20  | Failure, criticism, loss, conflict |
| Time decay          | Toward neutral | ±1-5   | Natural drift toward baseline      |
| Relationship change | Variable       | ±5-30  | Friendship, romance, betrayal      |
| World event         | Variable       | ±10-50 | Cataclysms, prosperity, war        |
| Location change     | Variable       | ±5-15  | Safe vs dangerous locations        |
| Item received       | +happiness     | +2-10  | Gifts, loot, rewards               |
| Item lost           | -happiness     | -5-15  | Theft, loss, destruction           |
| Companion nearby    | +happiness     | +1-5   | Social bonding                     |
| Companion hurt      | -happiness     | -5-15  | Emotional impact                   |

### Relationship Integration

Relationships affect mood recovery and stability:

```typescript
interface RelationshipMoodModifier {
  relationship_type: RelationshipType;
  relationship_strength: number; // -100 to +100

  // How relationship affects mood
  mood_recovery_modifier: number; // Multiplier for recovery rate
  mood_stability_modifier: number; // Affects mood stability
  event_intensity_modifier: number; // How much events affect mood

  // Relationship-specific triggers
  positive_triggers: string[]; // Events that boost mood
  negative_triggers: string[]; // Events that reduce mood
}
```

**Examples:**

- Strong ally (+80): Faster recovery, events less impactful
- Rival (-60): Slower recovery, negative events more impactful
- Romantic partner (+100): Fastest recovery, partner-related events amplified

### World/Location Integration

World context affects mood recovery and triggers:

```typescript
interface WorldMoodModifier {
  world_id: string;

  // World mood rules
  recovery_modifier: number; // Multiplier for recovery rate
  decay_modifier: number; // How fast mood drifts to neutral
  event_intensity_modifier: number; // How much events affect mood

  // Location-specific mood effects
  location_effects: LocationMoodEffect[];
}

interface LocationMoodEffect {
  location_id: string;
  mood_modifier: number; // Flat bonus/penalty to happiness
  recovery_modifier: number; // Recovery rate in this location
  duration: number; // How long effect lasts (in turns)
}
```

## Integration Points

### With Personality Integrity

Mood modifies expression, NOT personality:

```typescript
// Personality integrity enforced
const resolved = resolvePersonality(characterId, worldId,);
// resolved.traits = immutable personality traits
// resolved.expression = mood-modified expression
```

### With Character Resolution

Mood is part of character state resolution:

```typescript
function resolveCharacterState(
  characterId: string,
  worldId: string,
  storyId?: string,
): ResolvedCharacterState {
  const core = getCharacterCore(characterId,); // Immutable
  const mood = getMoodState(characterId,); // Mutable
  const worldModifiers = getWorldModifiers(characterId, worldId,);
  const storyModifiers = storyId ? getStoryModifiers(characterId, storyId,) : [];

  return {
    ...core,
    expression: applyMoodModifiers(core.personality, mood, worldModifiers, storyModifiers,),
  };
}
```

### With Avatar Selection

Mood affects which avatar is selected:

```typescript
// Avatar selection considers mood
const avatar = selectAvatar(characterId, {
  mood: moodState.mood_label,
  emotion: detectedEmotion,
  context: currentContext,
},);
```

### With Chat Generation

Mood is injected into LLM prompt:

```
[Mood — {{char}}]
Happiness: 35/100 (Sad)
Mood Label: melancholy
Stability: 70/100
Recovery Rate: 2/turn

[Expression Modifiers]
Tone: 30/100 (slightly negative)
Verbosity: 40/100 (shorter responses)
Cooperation: 35/100 (less willing)
Warmth: 25/100 (cold)
Humor: 15/100 (serious)
Formality: 50/100 (neutral)
Expressiveness: 30/100 (stoic)
Risk-Taking: 20/100 (cautious)
```

## Tasks

### Phase 1: Schema & Core (Week 1)

- [ ] Create `character_mood` table
- [ ] Create `mood_events` table
- [ ] Implement `MoodState` interface
- [ ] Implement mood update logic
- [ ] Add mood recovery (time decay)
- [ ] Add mood trigger handlers

### Phase 2: Expression System (Week 2)

- [ ] Implement `MoodExpressionModifier` interface
- [ ] Add expression calculation from mood level
- [ ] Add relationship mood modifiers
- [ ] Add world/location mood modifiers
- [ ] Integrate with personality resolution

### Phase 3: Integration (Week 3)

- [ ] Integrate with character resolver
- [ ] Integrate with chat generation (prompt injection)
- [ ] Integrate with avatar selection
- [ ] Add mood display in character UI
- [ ] Add mood history view

### Phase 4: Testing (Week 4)

- [ ] Unit tests for mood triggers
- [ ] Unit tests for expression modifiers
- [ ] Integration tests for mood resolution
- [ ] Integration tests with personality system

## Files to Create

- `src/characters/mood.ts` — Mood state and triggers
- `src/characters/mood-expression.ts` — Expression modifiers
- `src/characters/mood-triggers.ts` — Trigger handlers
- `src/db/schema-mood.ts` — Mood tables
- `src/routes/character-mood.ts` — Mood API
- `src/components/mood-meter.html` — UI component

## Files to Modify

- `src/characters/resolver.ts` — Mood integration
- `src/assistant/prompt/sections/` — Mood prompt injection
- `src/characters/avatar-selector.ts` — Mood-based selection
- `src/views/character-editor.html` — Mood display

## Risk

Medium — mood affects narrative output. If mood is too easy to max/min, characters become one-dimensional. Needs balanced recovery rates and meaningful triggers.

## Related

- TASK-character-personality-integrity.md — Personality integrity enforcement
- TASK-character-relationships.md — Relationships affect mood
- TASK-character-world-data-separation.md — World/location context
- TASK-emotions-avatar-edit-model.md — Avatar selection by mood
- epic-character-core-system.md — Parent epic
