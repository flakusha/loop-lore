# TASK: Emotion Intent Detection & Extensible Emotion System

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med
**Related:** TASK-emotions-avatar-edit-model, TASK-3d-character-avatars, TASK-rigged-model-buffer-render

## Summary

Build an extensible emotion system: admin/user-defined emotion list, LLM-based intent detection from chat messages, and precompiled portrait selection. Characters react emotionally to conversation.

## Rationale

- Fixed emotion set (happy/sad/angry) is limiting — users want custom expressions
- Group chats have multiple characters reacting differently to same message
- Emotional continuity across conversation (mood carries over)
- Precompiled portraits = fast, no generation delay

## Architecture

### Emotion Registry

```
Emotions (extensible):
  ├── Built-in: happy, sad, angry, surprised, neutral, love, fear, disgust
  ├── User-defined: custom emotions with portrait mappings
  ├── Admin-defined: system-wide custom emotions
  └── Per-character: character-specific emotion overrides
```

### Emotion Interface

```typescript
interface Emotion {
  id: string;                    // "happy", "custom-pensive"
  name: string;                  // Display name: "Happy", "Pensive"
  category: EmotionCategory;     // basic | complex | custom
  portrait: PortraitRef;         // Reference to precompiled portrait
  keywords: string[];            // Detection keywords
  priority: number;              // Conflict resolution (higher = wins)
  parentId?: string;             // For emotion hierarchies (happy → ecstatic)
}

type EmotionCategory = 'basic' | 'complex' | 'custom' | 'system';

interface PortraitRef {
  type: 'static' | 'sprite-sheet' | '3d-model' | 'rigged';
  assetId: string;
  metadata?: Record<string, unknown>;
}
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
Portrait Selection:
  ├── Look up emotion → portrait mapping
  ├── Fallback to neutral if no portrait
  └── Cache mapping for session
```

## Tasks

### Phase 1: Emotion Schema & CRUD

- [ ] Create `emotions` table (id, name, category, keywords, priority, portrait_id)
- [ ] Create `character_emotions` table (character_id, emotion_id, portrait_id, override)
- [ ] Add CRUD endpoints: `GET/POST/PUT/DELETE /api/emotions`
- [ ] Add character emotion assignment: `POST /api/characters/:id/emotions`
- [ ] Seed built-in emotions (happy, sad, angry, surprised, neutral, love, fear, disgust)
- [ ] Admin UI: emotion manager (list, create, edit, delete, preview portrait)

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

### Phase 3: Group Chat Emotion

- [ ] Per-character emotion detection (same message, different reactions)
- [ ] Emotion conflict resolution (two characters react oppositely)
- [ ] Character relationship context (rival vs friend affects emotion)
- [ ] Group mood aggregation (overall chat atmosphere)

### Phase 4: Emotional Continuity

- [ ] Emotion decay over time (anger fades, happiness lingers)
- [ ] Conversation context window (last N messages affect current emotion)
- [ ] User preference: "characters remember mood" toggle
- [ ] Emotional momentum (repeated sad messages → deeper sadness)

### Phase 5: Portrait Precompilation

- [ ] On emotion create/update: trigger portrait generation (if edit model available)
- [ ] Fallback: use static placeholder until portrait ready
- [ ] Portrait cache invalidation on emotion delete
- [ ] Batch generation: generate all emotion portraits for character

## Files to Create

- `src/db/schema-emotions.ts` — emotion tables
- `src/assistant/emotion-detector.ts` — detection engine
- `src/assistant/emotion-detector.test.ts` — tests
- `src/routes/emotions.ts` — CRUD endpoints
- `src/frontend/admin/emotion-manager.ts` — admin UI

## Files to Modify

- `src/db/schema.ts` — add emotion tables
- `src/db/migrations/` — migration for emotion tables
- `src/assistant/prompt/sections/` — inject emotion context into prompt
- `src/generation/generate-route.ts` — emotion-aware generation
- `src/views/chat.html` — display emotion indicator
- `src/views/settings.html` — emotion preferences

## Detection Accuracy

| Method | Accuracy | Cost | Speed |
| ------ | -------- | ---- | ----- |
| Rule-based | ~70% | Free | < 1ms |
| LLM-based | ~90% | ~$0.001/msg | ~200ms |
| Hybrid | ~85% | Low | ~50ms |

## Files to Modify (Emotion-to-Prompt)

- `src/assistant/prompt/sections/emotion-context.ts` — inject detected emotion into LLM context
- `src/generation/prompt-builder.ts` — emotion-aware prompt assembly

## Risk

Med — requires emotion schema design, detection pipeline, group chat complexity, portrait generation integration.
