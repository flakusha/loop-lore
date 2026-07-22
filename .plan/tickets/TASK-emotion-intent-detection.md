# TASK: Emotion Intent Detection & Extensible Emotion System

**Epic:** Character Core System
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started
**Related:** TASK-character-multi-avatar, TASK-character-mood-happiness

## Summary

Extensible emotion system: admin/user-defined emotion list, LLM-based or rule-based intent detection from chat messages, and integration with avatar selection. Characters react emotionally to conversation.

## Design

### Emotion Registry

```
Emotions (extensible):
  ├── Built-in: happy, sad, angry, surprised, neutral, love, fear, disgust
  ├── User-defined: custom emotions with avatar mappings
  ├── Admin-defined: system-wide custom emotions
  └── Per-character: character-specific emotion overrides
```

### Emotion Interface

```typescript
interface Emotion {
  id: string; // "happy", "custom-pensive"
  name: string; // Display name: "Happy", "Pensive"
  category: EmotionCategory; // basic | complex | custom | system
  keywords: string[]; // Detection keywords
  priority: number; // Conflict resolution (higher = wins)
  parentId?: string; // For emotion hierarchies (happy → ecstatic)

  // Avatar mapping
  default_avatar_id?: string; // Default avatar for this emotion
  avatar_tags: string[]; // Tags to match in avatar selection
}

type EmotionCategory = "basic" | "complex" | "custom" | "system";
```

### Detection Pipeline

```
Message Received
  ↓
Intent Detection (LLM or rule-based):
  ├── Rule-based: keyword matching (fast, cheap)
  ├── LLM-based: intent classification (accurate, expensive)
  └── Hybrid: rules first, LLM fallback
  ↓
Emotion Resolution:
  ├── Multiple detected emotions → priority resolution
  ├── Per-character emotion overrides
  ├── Group chat: each character gets own emotion
  └── Emotional continuity (decay from previous state)
  ↓
Avatar Selection:
  ├── Look up emotion → avatar mapping
  ├── Select avatar based on context
  └── Fallback to default if no match
```

### Detection Methods

| Method     | Accuracy | Cost        | Speed  |
| ---------- | -------- | ----------- | ------ |
| Rule-based | ~70%     | Free        | < 1ms  |
| LLM-based  | ~90%     | ~$0.001/msg | ~200ms |
| Hybrid     | ~85%     | Low         | ~50ms  |

### Emotion Resolution

When multiple emotions detected:

```typescript
interface EmotionResolution {
  primary: Emotion; // Highest priority emotion
  secondary: Emotion[]; // Other detected emotions
  confidence: number; // 0-100
  context: string; // What triggered this emotion
}
```

## Integration Points

### With Multi-Avatar System

Detected emotions drive avatar selection:

```typescript
// Emotion detected
const emotion = detectEmotion(message,);

// Select avatar based on emotion
const avatar = selectAvatar(characterId, {
  emotion: emotion.id,
  mood: moodState.mood_label,
  context: currentContext,
},);
```

### With Mood System

Emotions affect mood:

```typescript
// Emotion affects mood
const moodChange = {
  emotion: "happy",
  happiness_change: +10,
  duration: 3, // turns
};

// Update mood
updateMood(characterId, moodChange,);
```

### With Chat Generation

Emotions are injected into prompt:

```
[Emotion — {{char}}]
Detected: happy (confidence: 85%)
Trigger: Player gave gift
Avatar: happy_smile.png
```

### With Group Chat

Each character gets own emotion:

```typescript
// Group chat: multiple emotions
const emotions = {
  alice: detectEmotion(message, "alice",), // happy
  bob: detectEmotion(message, "bob",), // neutral
  charlie: detectEmotion(message, "charlie",), // surprised
};
```

## Tasks

### Phase 1: Emotion Schema & CRUD

- [ ] Create `emotions` table
- [ ] Create `character_emotions` table
- [ ] Add CRUD endpoints: `GET/POST/PUT/DELETE /api/emotions`
- [ ] Add character emotion assignment: `POST /api/characters/:id/emotions`
- [ ] Seed built-in emotions (happy, sad, angry, surprised, neutral, love, fear, disgust)
- [ ] Admin UI: emotion manager (list, create, edit, delete, preview avatar)

### Phase 2: Intent Detection

- [ ] Create `src/assistant/emotion-detector.ts` — detection engine
- [ ] Implement rule-based detector:
  - Keyword matching from emotion.keywords
  - Sentiment analysis (positive/negative/neutral)
  - Punctuation/exclamation intensity
  - Emoji detection
- [ ] Implement LLM-based detector (optional, for accuracy):
  - Classification prompt: "What emotion does this message convey?"
  - Returns emotion ID + confidence score
- [ ] Hybrid mode: rules first, LLM if confidence < threshold
- [ ] Unit tests for all detection methods

### Phase 3: Integration

- [ ] Integrate with multi-avatar system (avatar selection)
- [ ] Integrate with mood system (mood updates)
- [ ] Integrate with chat generation (prompt injection)
- [ ] Integrate with group chat (per-character emotions)
- [ ] Add emotion display in chat UI

### Phase 4: Testing

- [ ] Unit tests for emotion detection
- [ ] Unit tests for emotion resolution
- [ ] Integration tests with avatar selection
- [ ] Integration tests with mood system

## Files to Create

- `src/db/schema-emotions.ts` — emotion tables
- `src/assistant/emotion-detector.ts` — detection engine
- `src/assistant/emotion-detector.test.ts` — tests
- `src/routes/emotions.ts` — CRUD endpoints
- `src/frontend/admin/emotion-manager.ts` — admin UI

## Files to Modify

- `src/db/schema.ts` — add emotion tables
- `src/db/migrations/` — migration for emotion tables
- `src/assistant/prompt/sections/emotion-context.ts` — inject detected emotion into LLM context
- `src/generation/prompt-builder.ts` — emotion-aware prompt assembly
- `src/characters/avatar-selector.ts` — emotion-based selection
- `src/characters/mood.ts` — emotion mood updates
- `src/views/chat.html` — display emotion indicator
- `src/views/settings.html` — emotion preferences

## Risk

Med — requires emotion schema design, detection pipeline, group chat complexity, avatar integration.

## Related

- TASK-character-multi-avatar.md — Avatar selection by emotion
- TASK-character-mood-happiness.md — Emotions affect mood
- TASK-character-personality-integrity.md — Emotions affect expression, not personality
- epic-character-core-system.md — Parent epic
