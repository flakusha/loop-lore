# TASK: Character Mood Swings & Happiness Meter

**Epic:** RPG Mechanics & Extensible Game Systems
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started
**Source:** `.tmp/loop-lore-ideas.md` — Mood Swings And Preferred Moods

## Summary

Characters have a happiness meter that impacts their personality and behavior.
Ways to become more or less happy, with happiness level affecting personality
expression, dialogue tone, and interaction choices. This is a general mood
system, distinct from Epic 43's heat-cycle (species-specific reproductive
mood instability).

## Rationale

- Happiness level should mechanically affect character behavior
- Players need visibility into character emotional state
- Mood impacts dialogue, choices, and story outcomes
- Personality may be affectionate or cold/stoic depending on happiness

## Design

### Happiness Meter

| Range  | Label     | Personality Impact                                  |
| ------ | --------- | --------------------------------------------------- |
| 0-20   | Depressed | Withdrawn, negative dialogue, reduced cooperation   |
| 21-40  | Sad       | Less enthusiastic, shorter responses, slower trust  |
| 41-60  | Neutral   | Baseline personality, normal behavior               |
| 61-80  | Happy     | More enthusiastic, cooperative, open                |
| 81-100 | Joyful    | Exuberant, takes risks, shares secrets more readily |

### Mood Change Triggers

| Trigger              | Effect         | Notes                                |
| -------------------- | -------------- | ------------------------------------ |
| Positive events      | +happiness     | Success, praise, gifts, bonding      |
| Negative events      | -happiness     | Failure, criticism, loss, conflict   |
| Time decay           | Toward neutral | Natural drift toward baseline        |
| Relationship changes | Variable       | Friendship, romance, betrayal        |
| World events         | Variable       | Cataclysms, prosperity, war          |
| Character traits     | Modifier       | Optimistic characters recover faster |

### Preferred Moods

Characters can have preferred mood states:

```typescript
interface MoodPreference {
  character_id: string;
  preferred_range: [number, number,]; // e.g., [60, 100] for "prefers happy"
  preferred_moods: MoodLabel[]; // ["content", "playful", "affectionate"]
  mood_stability: number; // 0-100, higher = slower mood changes
  recovery_rate: number; // Happiness recovered per turn when positive
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
```

### Personality Impact

```typescript
interface MoodPersonalityImpact {
  mood_level: number; // 0-100
  personality_modifiers: {
    trait: string; // "extraversion", "agreeableness", etc.
    modifier: number; // -50 to +50
  }[];
  dialogue_tone: "negative" | "neutral" | "positive";
  cooperation_willingness: number; // 0-100
  secret_sharing_probability: number; // 0-100
}
```

## Integration Points

- **Character Core** (TASK-character-world-data-separation): Mood as persistent state
- **Multi-Personality** (TASK-character-multi-personality.md): Mood as switching stimulus
- **NSFW Intimacy** (TASK-nsfw-intimacy-system.md): Mood affects intimacy readiness
- **Chat Generation**: Mood injected into prompt context

## Tasks

- [ ] Design mood meter data model + triggers
- [ ] Implement `character_mood` table (current level, history)
- [ ] Implement mood change triggers (events, time decay, relationships)
- [ ] Implement personality modifiers per mood level
- [ ] Implement preferred moods + stability
- [ ] Wire mood into character resolution
- [ ] Add mood display in character UI
- [ ] Write tests for mood change logic

## Risk

Medium — happiness meter affects narrative output. If happiness is too easy to max/min,
characters become one-dimensional. Needs balanced recovery rates and meaningful triggers.

## Files

- `src/characters/mood.ts` — mood meter + triggers
- `src/db/schema-mood.ts` — mood tables
- `src/characters/resolver.ts` — mood resolution in layer merge
- `src/frontend/components/mood-meter.html` — UI component

## Related

- TASK-character-multi-personality.md — Mood as personality switching stimulus
- TASK-nsfw-intimacy-system.md — Mood affects intimacy
- TASK-nsfw-mood-emotional.md — Heat-cycle mood (Epic 43, different mechanism)
- Epic RPG Mechanics — Extensible Game Systems
