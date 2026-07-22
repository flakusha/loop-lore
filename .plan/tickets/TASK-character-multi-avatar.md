# TASK: Character Multi-Avatar System

**Epic:** Character Core System
**Priority:** Medium
**Effort:** High
**Status:** In Progress (services + routes done, needs validation)
**Supersedes:** TASK-emotions-avatar-edit-model.md

## Summary

One-to-many avatar system with context/mood/action awareness. Characters can have multiple avatars tagged by emotion, mood, action, location, time of day, and outfit. Configurable selection rules per-character and per-world.

## Core Principle

**One character, many avatars.**

A character can have different avatars for different contexts: happy expression, sad expression, fighting pose, sleeping pose, etc. Selection is configurable and extensible.

## Design

### Avatar Schema

```typescript
interface CharacterAvatar {
  id: string;
  character_id: string;
  asset_id: string; // Reference to assets table

  // Context tags (all optional)
  emotion?: string; // "happy", "sad", "angry", "surprised", "neutral"
  mood?: string; // "neutral", "stressed", "relaxed", "excited"
  action?: string; // "fighting", "sleeping", "eating", "walking", "idle"
  location?: string; // "forest", "city", "dungeon", "home"
  time_of_day?: string; // "morning", "afternoon", "evening", "night"
  outfit?: string; // "armor", "casual", "formal", "pajamas"

  // Priority and defaults
  priority: number; // Higher = preferred when multiple match
  is_default: boolean; // Fallback avatar when no match

  // Metadata
  created_at: Date;
  updated_at: Date;
}
```

### Avatar Selection Rules

Configurable per-character and per-world:

```typescript
interface AvatarSelectionConfig {
  character_id: string;

  // Selection strategy
  strategy: AvatarStrategy;

  // Weight configuration
  weights: AvatarWeights;

  // Fallback rules
  fallback_chain: AvatarFallbackRule[];
  default_avatar_id: string;

  // Auto-generation
  auto_generate_missing: boolean;
  generation_model?: string;
}

type AvatarStrategy =
  | "emotion_first" // Check emotion tags first
  | "mood_first" // Check mood tags first
  | "action_first" // Check action tags first
  | "context_first" // Check location/time tags first
  | "weighted"; // Weighted scoring across all tags

interface AvatarWeights {
  emotion: number; // 0-100, importance of emotion match
  mood: number;
  action: number;
  location: number;
  time_of_day: number;
  outfit: number;
}

interface AvatarFallbackRule {
  condition: string; // "no_emotion_match", "no_mood_match", etc.
  action: "use_default" | "use_nearest" | "use_previous" | "generate";
  priority: number;
}
```

### Avatar Selection Algorithm

```typescript
function selectAvatar(
  characterId: string,
  context: AvatarContext,
): CharacterAvatar | null {
  const config = getAvatarConfig(characterId,);
  const avatars = getCharacterAvatars(characterId,);

  if (avatars.length === 0) { return null; }
  if (avatars.length === 1) { return avatars[0]; }

  // Score each avatar based on context
  const scored = avatars.map((avatar,) => ({
    avatar,
    score: calculateAvatarScore(avatar, context, config.weights,),
  }));

  // Sort by score (highest first)
  scored.sort((a, b,) => b.score - a.score);

  // Return best match if score > threshold
  if (scored[0].score > 0.5) {
    return scored[0].avatar;
  }

  // Apply fallback rules
  for (const rule of config.fallback_chain) {
    if (evaluateFallbackCondition(rule.condition, context,)) {
      return applyFallbackAction(rule.action, avatars, context,);
    }
  }

  // Return default avatar
  return avatars.find((a,) => a.is_default) ?? avatars[0];
}

function calculateAvatarScore(
  avatar: CharacterAvatar,
  context: AvatarContext,
  weights: AvatarWeights,
): number {
  let score = 0;
  let totalWeight = 0;

  // Emotion match
  if (avatar.emotion && context.emotion) {
    const emotionScore = avatar.emotion === context.emotion ? 1.0 : 0.0;
    score += emotionScore * weights.emotion;
    totalWeight += weights.emotion;
  }

  // Mood match
  if (avatar.mood && context.mood) {
    const moodScore = avatar.mood === context.mood ? 1.0 : 0.0;
    score += moodScore * weights.mood;
    totalWeight += weights.mood;
  }

  // Action match
  if (avatar.action && context.action) {
    const actionScore = avatar.action === context.action ? 1.0 : 0.0;
    score += actionScore * weights.action;
    totalWeight += weights.action;
  }

  // Location match
  if (avatar.location && context.location) {
    const locationScore = avatar.location === context.location ? 1.0 : 0.0;
    score += locationScore * weights.location;
    totalWeight += weights.location;
  }

  // Time of day match
  if (avatar.time_of_day && context.time_of_day) {
    const timeScore = avatar.time_of_day === context.time_of_day ? 1.0 : 0.0;
    score += timeScore * weights.time_of_day;
    totalWeight += weights.time_of_day;
  }

  // Outfit match
  if (avatar.outfit && context.outfit) {
    const outfitScore = avatar.outfit === context.outfit ? 1.0 : 0.0;
    score += outfitScore * weights.outfit;
    totalWeight += weights.outfit;
  }

  // Normalize score
  return totalWeight > 0 ? score / totalWeight : 0;
}
```

### Avatar Context

Current context for avatar selection:

```typescript
interface AvatarContext {
  // Current state
  emotion?: string; // Detected emotion from message
  mood?: string; // Current mood label
  action?: string; // Current action (fighting, sleeping, etc.)
  location?: string; // Current location
  time_of_day?: string; // Current time
  outfit?: string; // Current outfit

  // Additional context
  relationship?: string; // Relationship with speaker
  group_chat?: boolean; // In group chat
  nsfw?: boolean; // NSFW context
}
```

### World Avatar Config

World-specific avatar configuration:

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
  auto_generate_missing: boolean;
  generation_model?: string;

  // Default strategy
  default_strategy: AvatarStrategy;
  default_weights: AvatarWeights;
}
```

## Integration Points

### With Mood System

Mood affects avatar selection:

```typescript
// Avatar selection considers mood
const avatar = selectAvatar(characterId, {
  mood: moodState.mood_label, // "happy", "sad", etc.
  emotion: detectedEmotion,
  context: currentContext,
},);
```

### With Emotion Detection

Detected emotions drive avatar changes:

```typescript
// Emotion detected from message
const emotion = detectEmotion(message,);
// Select avatar based on emotion
const avatar = selectAvatar(characterId, {
  emotion: emotion.label,
  mood: moodState.mood_label,
},);
```

### With Chat Generation

Avatar is included in chat context:

```
[Avatar — {{char}}]
Selected: happy_smile.png
Context: emotion=happy, mood=content, location=home
Score: 0.95
```

### With Asset System

Avatars link to assets:

```typescript
// Avatar references asset
const avatar = {
  id: "avatar_123",
  character_id: "char_456",
  asset_id: "asset_789", // Links to assets table
  emotion: "happy",
};

// Asset is the actual image
const asset = {
  id: "asset_789",
  url: "/assets/happy_smile.png",
  type: "image",
};
```

## Tasks

### Phase 1: Schema & Core (Week 1)

- [ ] Create `character_avatars` table
- [ ] Create `character_avatar_config` table
- [ ] Create `world_avatar_config` table
- [ ] Implement avatar CRUD
- [ ] Implement config CRUD
- [ ] Add avatar validation

### Phase 2: Selection System (Week 2)

- [ ] Implement avatar selection algorithm
- [ ] Add weighted scoring
- [ ] Add fallback rules
- [ ] Add strategy modes
- [ ] Add context detection

### Phase 3: Integration (Week 3)

- [ ] Integrate with mood system
- [ ] Integrate with emotion detection
- [ ] Integrate with chat generation
- [ ] Integrate with asset system
- [ ] Add avatar display in chat UI

### Phase 4: UI & Testing (Week 4)

- [ ] Add avatar manager in character UI
- [ ] Add avatar upload/preview
- [ ] Add avatar config editor
- [ ] Add avatar selection preview
- [ ] Write unit tests for avatar selection
- [ ] Write integration tests with mood/emotion systems

## Files to Create

- `src/characters/avatars.ts` — Avatar CRUD
- `src/characters/avatar-selector.ts` — Selection algorithm
- `src/characters/avatar-config.ts` — Config CRUD
- `src/db/schema-avatars.ts` — Avatar tables
- `src/routes/character-avatars.ts` — API endpoints
- `src/components/avatar-manager.html` — UI component
- `src/components/avatar-config-editor.html` — Config UI

## Files to Modify

- `src/db/schema-core.ts` — Avatar column types
- `src/db/migrations/` — New tables
- `src/characters/mood.ts` — Mood-based selection
- `src/assistant/emotion-detector.ts` — Emotion-based selection
- `src/assistant/prompt/sections/` — Avatar prompt injection
- `src/views/chat.html` — Avatar display
- `src/views/character-editor.html` — Avatar manager
- `src/assets/service.ts` — Asset linking

## Risk

High — significant complexity in selection algorithm, config system, and integration with multiple systems. Needs careful testing of selection logic and fallback behavior.

## Related

- TASK-character-mood-happiness.md — Mood affects avatar selection
- TASK-emotion-intent-detection.md — Emotion detection for avatars
- TASK-emotions-avatar-edit-model.md — Superseded by this task
- TASK-character-world-data-separation.md — Per-world avatars
- epic-character-core-system.md — Parent epic
