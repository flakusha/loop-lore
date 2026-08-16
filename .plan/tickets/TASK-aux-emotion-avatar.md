<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: AUX LLM — Emotion Avatar Selection

**Status:** 🟡 Partial — avatar selection infra + EmotionHook exist; no LLM wiring (2026-08-01). Binding model updated 2026-08-02: emotion avatars are now **per message/chat** (see `epic-emotion-avatar-message-binding`); the old global `_currentEmotionAvatar` mood-swap is replaced by per-message resolution.
**Priority:** P2-B
**Effort:** Small
**Epic:** epic-aux-enrichment-pipeline / epic-emotion-avatar-message-binding
**Tags:** aux-llm, avatar, emotion, character, expression

## Summary

AUX LLM detects emotion changes in assistant responses and triggers
context-aware avatar selection. Replaces regex-based `detectAvatarChangeIntent()`
with LLM classification for richer emotion detection.

## What Exists

| Component                                  | Status        | Location                                |
| ------------------------------------------ | ------------- | --------------------------------------- |
| `POST /api/actors/:actorId/avatars/select` | ✅            | `routes/character-avatars.ts`           |
| `AvatarService.selectAvatar()`             | ✅            | `characters/services/avatar-service.ts` |
| `detectAvatarChangeIntent()`               | ✅ Regex only | `assistant/intent.ts`                   |
| Emotion avatar generation                  | ✅            | `routes/character-emotion-avatars.ts`   |
| Avatar selection by emotion/mood/action    | ✅            | Weighted scoring in AvatarService       |
| LLM-based emotion detection                | ❌            | Only regex patterns                     |
| Auto-trigger on response                   | ❌            | Manual API call only                    |

## Design

### Current Flow (Regex Only)

```
Assistant response: "She smiles warmly at you"
  ↓
detectAvatarChangeIntent() → regex match "smiles" → "happy"
  ↓
Manual: POST /api/actors/:actorId/avatars/select { emotion: "happy" }
  ↓
AvatarService.selectAvatar() → best matching avatar
```

Problem: Regex only catches explicit emotion words ("smiles", "frowns").
Misses contextual emotions ("She crosses her arms and looks away" → annoyed).

### New Flow (AUX LLM)

```
Assistant response generated
  ↓
AUX LLM classifies emotion (parallel with main flow)
  ↓
If emotion changed from previous → trigger avatar selection
  ↓
AvatarService.selectAvatar() → best matching avatar
  ↓
Frontend receives avatar update via existing avatar system
```

### AUX LLM Emotion Classification

#### System Prompt

```
You are an emotion classifier for a roleplay character's expression.
Analyze the assistant's response to determine the character's emotion.

Emotion categories:
- "happy" - smiling, laughing, joyful
- "sad" - crying, melancholy, downcast
- "angry" - shouting, frowning, hostile
- "fearful" - trembling, wide-eyed, anxious
- "surprised" - startled, eyes wide, gasping
- "disgusted" - recoiling, grimacing, repulsed
- "neutral" - calm, composed, baseline
- "flirtatious" - playful, suggestive, warm gaze
- "confused" - puzzled, head tilted, uncertain
- "determined" - focused, set jaw, resolute
- "exhausted" - drooping, heavy-lidded, weary
- "excited" - animated, bright-eyed, energetic

Reply with ONLY a JSON object:
{
  "emotion": "emotion_category",
  "intensity": <0.0-1.0>,
  "confidence": <0.0-1.0>,
  "changeFromPrevious": true/false
}

Rules:
- emotion is the dominant emotion in the response
- intensity: 0.0=subtle, 1.0=extreme
- changeFromPrevious: true if this differs from the last classified emotion
- confidence < 0.5 means uncertain
```

#### Output

```typescript
interface EmotionClassification {
  emotion: string;
  intensity: number; // 0.0-1.0
  confidence: number; // 0.0-1.0
  changeFromPrevious: boolean;
}
```

### Integration

1. After main generation, AUX classifies emotion
2. If `changeFromPrevious === true` AND `confidence >= 0.5`:
   - Call `AvatarService.selectAvatar()` with new emotion
   - Emit `avatar.emotion_changed` event
   - Frontend updates character avatar display
3. Emotion state tracked in memory (previous emotion for comparison)
4. Side effect (avatar update) happens async

### Avatar Selection Context

```typescript
interface AvatarSelectionContext {
  emotion?: string; // From AUX classification
  mood?: number; // From mood classification (0-100)
  action?: string; // From environment interaction detection
  location?: string; // From scene context extraction
  time?: string; // From scene context (timeOfDay)
  outfit?: string; // From character state
}
```

The AUX pipeline already extracts mood, environment interactions, and scene
context — these feed directly into avatar selection as additional context.

### Token Budget

| Component          | Tokens   |
| ------------------ | -------- |
| System message     | ~200     |
| Assistant response | ~500     |
| **Total input**    | **~700** |
| Response           | ~80      |
| **Total**          | **~780** |

## Current State (2026-08-01 review)

| Component                                  | Status                                                                                  | Location                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `POST /api/actors/:actorId/avatars/select` | ✅                                                                                      | `routes/character-avatars.ts:239`               |
| `AvatarService.selectAvatar()`             | ✅ weighted scoring, `emotion_first` rule                                               | `characters/services/avatar-service.ts`         |
| Emotion avatar generation (ComfyUI)        | ✅ image-gen only, no LLM                                                               | `characters/services/emotion-avatar-service.ts` |
| `detectAvatarChangeIntent()`               | ❌ **dead code** — zero consumers                                                       | `assistant/intent.ts:139`                       |
| `EmotionHook` (`emotion_change`)           | ⚠️ keyword-based; doc header claims "Uses the LLM" (stale)                               | `generation/hooks/emotion-hook.ts`              |
| Hook event consumption                     | ❌ `data.dominantEmotion` never read — `auto-gen.ts` consumes only `hookResult.allowed` | `generation/auto-gen.ts:412-431`                |
| Auto-trigger on response                   | ❌ manual API call only                                                                 | —                                               |

Key finding: the emotion → avatar pipeline is a **dead end**. The
`emotion_change` event fires (keyword match) but nothing reads its `data`;
the only avatar selection path is the explicit HTTP route with
user-supplied `emotion`/`mood` context.

## Next Actionable Items

1. **Consume the emotion hook per message** (done 2026-08-02): in `auto-gen.ts`
   post-hook, read `events` for `emotion_change`, extract `data.dominantEmotion`,
   and persist it to `messages.emotion` (new column). The frontend now resolves the
   per-message avatar in `mood.ts:avatarForMessage(msg)` from the message's
   emotion + the actor's emotion-tagged avatars — no global mood-drive `_currentEmotionAvatar` swap.
2. **AUX LLM classification upgrade** (optional): classify on the auxiliary role
   via shared runner (M1), replace keyword `EmotionHook` — richer emotions than regex.
3. **LLM emotions vs EmotionType enum alignment**: LLM emotions ("flirtatious",
   "determined", "exhausted") must align with `EmotionType` values used as avatar
   tags (`src/db/enums-character.ts:126`). Verify enum covers the prompt's 12 emotions.
4. **Match scoring gap**: `calculateAvatarScore` needs exact lowercase
   tag==context equality (see epic-emotion-avatar-message-binding).
5. **Tests**: extend `avatar-service.test.ts` with AUX-triggered selection;
   message-persist unit test in auto-gen flow.

## Files to Create

- `src/aux-pipeline/tasks/emotion-avatar.ts` — emotion classifier

## Files to Modify

- `src/aux-pipeline/index.ts` — register emotion-avatar task
- `src/aux-pipeline/types.ts` — add EmotionClassification type
- `src/characters/services/avatar-service.ts` — add AUX-triggered selection
- `src/frontend/alpine/chat.ts` — handle avatar update events

## Acceptance Criteria

- [ ] Emotion classification returns valid JSON
- [ ] Only triggers avatar change when emotion changes
- [ ] Confidence threshold filtering works (>= 0.5)
- [ ] Avatar selection uses full context (emotion + mood + action + location)
- [ ] Frontend updates avatar display on change
- [ ] Timeout/error → no avatar change (graceful)
- [ ] Existing avatar selection tests still pass
- [ ] `detectAvatarChangeIntent()` regex still works as fast path

## Verification

```bash
bun run check
bun test src/characters/services/avatar-service.ts
bun test src/aux-pipeline/
```
