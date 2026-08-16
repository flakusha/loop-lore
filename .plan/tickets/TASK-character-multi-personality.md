<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Multi-Personality System

**Epic:** RPG Mechanics & Extensible Game Systems
**Priority:** Medium
**Effort:** High
**Status:** Not Started
**Source:** `.tmp/loop-lore-ideas.md` — Character Multi Personality

## Summary

Characters may have multiple personalities that switch based on randomness or
stimulus (events, mood, world state). Specific personalities can be locked in
based on world or chat configurations. This is distinct from mood swings
(Epic 43 heat-cycle) — it is a structural personality split, not an emotional
state.

## Rationale

- Characters with DID or multi-faceted personalities need mechanical representation
- World/story configs may require a character to behave in a specific personality
- Randomness adds narrative variety and replayability
- Stimulus-based switching creates reactive storytelling

## Design

### Personality Switching Modes

| Mode         | Trigger                   | Description                               |
| ------------ | ------------------------- | ----------------------------------------- |
| **Random**   | Turn-based or time-based  | Personality changes randomly at intervals |
| **Stimulus** | Events, mood, world state | Personality shifts based on triggers      |
| **Locked**   | World/chat config         | Personality fixed to a specific variant   |
| **Manual**   | User/command              | User selects active personality           |

### Personality Definition

```typescript
interface CharacterPersonality {
  id: string;
  character_id: string;
  name: string; // "Alice (Professional)", "Alice (Childhood)"
  description?: string;
  traits: PersonalityTrait[]; // Overrides base personality traits
  speech_patterns: SpeechPattern[];
  behavior_modifiers: BehaviorModifier[];
  activation_conditions: ActivationCondition[];
}

interface ActivationCondition {
  type: "random" | "event" | "mood" | "world_state" | "relationship" | "time";
  weight: number; // Probability or threshold
  parameters: Record<string, unknown>;
}

interface SpeechPattern {
  formality: "formal" | "informal" | "childlike" | "scholarly" | "casual";
  vocabulary: string[]; // Personality-specific word list
  sentence_structure: "simple" | "complex" | "fragmented" | "verbose";
  tone: "friendly" | "hostile" | "neutral" | "playful" | "serious";
}
```

### Configuration Locking

World or chat configs can lock a character to a specific personality:

```typescript
interface PersonalityLock {
  character_id: string;
  context_id: string; // world_id or chat_id
  context_type: "world" | "chat";
  locked_personality_id: string;
  reason?: string; // "World requires professional demeanor"
}
```

### Switching Mechanics

```typescript
interface PersonalitySwitch {
  character_id: string;
  from_personality_id?: string;
  to_personality_id: string;
  trigger: SwitchTrigger;
  timestamp: Date;
  context: { world_id?: string; chat_id?: string; event?: string };
}

type SwitchTrigger =
  | "random_roll"
  | "event_threshold"
  | "mood_change"
  | "world_state"
  | "relationship_change"
  | "manual_override"
  | "config_lock";
```

## Integration Points

- **Character Core** (TASK-character-world-data-separation): Personality as Layer 0 trait
- **World Overlay**: Personality locks per world
- **Chat Context**: Personality locks per chat
- **Event System**: Stimulus triggers from world events
- **Mood System**: Mood-based personality switching (if mood swings implemented)

## Tasks

- [ ] Design personality data model + switching triggers
- [ ] Implement `character_personalities` table
- [ ] Implement personality lock per world/chat
- [ ] Implement random switching mechanism
- [ ] Implement stimulus-based switching (event/mood/world-state triggers)
- [ ] Implement manual override (user/command)
- [ ] Wire personality into character resolution (Layer 0)
- [ ] Add personality editor in character UI
- [ ] Write tests for switching logic

## Risk

Medium-High — personality switching can break character consistency if switching is too
frequent or unpredictable. Needs careful tuning of activation conditions and switching
cooldowns.

## Files

- `src/characters/personalities.ts` — personality CRUD + switching
- `src/db/schema-personalities.ts` — personality tables
- `src/characters/resolver.ts` — personality resolution in layer merge
- `src/components/personality-editor.html` — UI component

## Related

- TASK-character-world-data-separation.md — Character Core layer
- TASK-character-mood-happiness.md — Mood swings (separate but related)
- Epic RPG Mechanics — Extensible Game Systems
- Epic 43 (NSFW) — Heat-cycle mood instability (different mechanism)
