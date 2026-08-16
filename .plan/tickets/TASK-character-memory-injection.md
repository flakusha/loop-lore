<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Memory Injection Probability & Privacy

**Epic:** epic-memory-knowledge-systems
**Priority:** Medium
**Effort:** High
**Status:** ✅ Done
**Source:** `.tmp/loop-lore-ideas.md` — Memory System And Personalized Memories Injection

## Summary

Character memories are injected into chat context with configurable probability
and randomness. Memories have privacy levels (absolute/isolated, localized),
and characters may be "comfortable" or "uncomfortable" remembering things.
"Secrets" sharing has a probability based on relationship and mood.

## Rationale

- Not all memories should be injected every time — adds realism and surprise
- Memory privacy levels control what gets shared in different contexts
- Character comfort with remembering affects narrative authenticity
- Secret sharing probability creates tension and discovery moments

## Design

### Memory Injection

```typescript
interface MemoryInjectionConfig {
  character_id: string;
  base_probability: number; // 0-100, base chance per message
  randomness: number; // 0-100, variance in injection chance
  context_boost: number; // Multiplier when context is relevant
  max_injections: number; // Max memories per message
  cooldown: number; // Turns between injections of same memory
}

interface MemoryInjectionEvent {
  memory_id: string;
  character_id: string;
  injected_at: Date;
  context: string; // What triggered the injection
  probability: number; // Actual probability used
  injected: boolean; // Whether it was actually injected
}
```

### Memory Privacy Levels

| Level          | Description                          | Sharing               |
| -------------- | ------------------------------------ | --------------------- |
| **Absolute**   | Never shared, completely isolated    | Only character knows  |
| **Isolated**   | Only in private one-on-one chats     | Never in group/public |
| **Localized**  | Shared within specific world/context | World-scoped          |
| **Contextual** | Shared based on relationship/context | Conditional           |
| **Public**     | Can be shared freely                 | Any context           |

```typescript
type MemoryPrivacyLevel = "absolute" | "isolated" | "localized" | "contextual" | "public";

interface MemoryPrivacy {
  memory_id: string;
  level: MemoryPrivacyLevel;
  exceptions: string[]; // Character IDs allowed to know (for absolute/isolated)
  world_scope: string[]; // Worlds where localized memories are shared
}
```

### Comfort & Secret Sharing

```typescript
interface MemoryComfort {
  character_id: string;
  comfortable_sharing: boolean; // General willingness to share memories
  secret_sharing_probability: number; // 0-100, chance to share secrets
  mood_modifier: number; // Happiness affects sharing probability
  relationship_threshold: number; // Minimum intimacy for secret sharing
  trauma_resistance: number; // Resistance to sharing traumatic memories
}

interface SecretMemory {
  memory_id: string;

  is_secret: boolean;
  sharing_probability: number; // Per-memory override
  trigger_conditions: TriggerCondition[]; // When to consider sharing
  consequences: string[]; // What happens if shared
}
```

### Injection Algorithm

```typescript
function shouldInjectMemory(
  memory: CharacterMemory,
  config: MemoryInjectionConfig,
  context: ChatContext,
  character: Character,
): boolean {
  // Base probability
  let prob = config.base_probability;

  // Context relevance boost
  if (isContextRelevant(memory, context,)) {
    prob *= config.context_boost;
  }

  // Apply randomness
  prob += (Math.random() - 0.5) * config.randomness;

  // Mood/comfort modifier
  prob *= getComfortModifier(character, memory,);

  // Privacy check
  if (!checkPrivacy(memory, context,)) {
    return false;
  }

  return Math.random() * 100 < prob;
}
```

## Integration Points

- **Memory Systems** (Epic 25): Core memory storage and retrieval
- **Character Core** (TASK-character-world-data-separation): Comfort as character trait
- **Mood System** (TASK-character-mood-happiness.md): Mood affects sharing probability
- **Chat Context Window** (Epic 36): Injection into context window
- **NSFW Intimacy** (TASK-nsfw-intimacy-system.md): Secret sharing in intimate contexts

## Tasks

- [ ] Design memory injection probability model
- [ ] Implement memory privacy levels + sharing rules
- [ ] Implement comfort system + secret sharing probability
- [ ] Implement injection algorithm with context awareness
- [ ] Add memory injection to context window pipeline
- [ ] Add memory privacy settings in character editor
- [ ] Write tests for injection probability logic

## Risk

Medium-High — injection probability affects narrative quality. Too frequent = noisy context;
too rare = character feels amnesiac. Privacy level edge cases need careful testing (e.g.,
absolute-memory leaked in group chat).

## Files

- `src/characters/memory-injection.ts` — injection logic
- `src/db/schema-memory-privacy.ts` — privacy tables
- `src/chat/context-window.ts` — injection integration
- `src/components/memory-privacy-editor.html` — UI component

## Related

- TASK-character-mood-happiness.md — Mood affects memory sharing
- TASK-nsfw-intimacy-system.md — Secret sharing in intimate contexts
- TASK-character-multi-personality.md — Personality affects comfort
- Epic 25 (Memory Systems)
- Epic 36 (Chat Lifecycle & Moderation)

## Completion Note

TrustModifier wired — injection probability model partially implemented via provision pipeline
