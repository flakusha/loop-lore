# TASK: Emotion Intent Detection & Extensible Emotion System

**Epic:** Character Core System
**Priority:** Medium
**Effort:** Medium
**Status:** 🟡 Partial — `emotions`/`character_emotions` tables + EmotionHook exist; detection keyword-only, no avatar/mood integration (2026-08-01)
**Related:** TASK-character-multi-avatar, TASK-character-mood-happiness

## Summary

Extensible emotion system: admin/user-defined emotion list, LLM-based or rule-based intent detection from chat messages, and integration with avatar selection. Characters react emotionally to conversation.

## Current State (2026-08-01 review)

| Component                         | Status                                                     | Location                              |
| --------------------------------- | ---------------------------------------------------------- | ------------------------------------- |
| `emotions` + `character_emotions` tables | ✅ schema exists                                     | `src/db/schema-character.ts:142,154` |
| `EmotionType` enum                | ✅ fixed set (no custom emotions)                          | `src/db/enums-character.ts:126`       |
| Emotion CRUD routes               | ✅ `character-emotions.ts` (per-character)                 | `src/routes/character-emotions.ts`    |
| Rule-based detection              | ⚠️ keyword matching in `EmotionHook` — no priority resolution, no sentiment/punctuation/emoji signals | `src/generation/hooks/emotion-hook.ts` |
| LLM-based detection               | ❌ not implemented (hook doc header claims LLM — stale)     | —                                     |
| Emotion → avatar selection        | ❌ events unconsumed (`data.dominantEmotion` never read); only manual `POST /avatars/select` | `generation/auto-gen.ts:412-431` |
| Emotion → mood integration        | ❌ not wired                                                | —                                     |
| Extensible/admin-defined emotions | ❌ enum is fixed, no `Emotion` table rows CRUD             | —                                     |

## Next Actionable Items

1. **Consume `emotion_change` hook events** (epic M4): post-hook in
   `auto-gen.ts` → avatar selection (`AvatarService.selectAvatar`) + persist
   emotion; coordinates with `TASK-aux-emotion-avatar`.
2. **Hybrid detection** (Phase 2): keep keyword fast-path, add AUX LLM
   fallback when rule confidence < threshold, via shared AUX runner (epic M1).
   Align LLM emotion labels with `EmotionType` enum.
3. **Extensibility**: decide enum-fixed vs `emotions` table rows (schema
   exists but likely unused); if table-backed, wire CRUD + admin UI + priority
   resolution, then remove enum-only assumption from scoring.
4. **Group chat**: per-character emotion resolution (each participant gets
   own emotion) — `turning/` integration.
5. **Prompt injection**: emotion context into next generation
   (`assistant/prompt/sections/emotion-avatar.ts` exists — verify it reads
   live emotion state, not just static avatar asset).
6. **Tests**: unit tests for detection + resolution; integration tests with
   avatar selection and mood system (per Phase 4).

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
