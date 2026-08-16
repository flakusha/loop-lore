<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: AUX LLM — Mood Classification

**Status:** 🟡 Partial — MoodHook exists but keyword-based, no LLM, results unconsumed (2026-08-01)
**Priority:** P2-B
**Effort:** Small
**Epic:** epic-aux-enrichment-pipeline
**Tags:** aux-llm, mood, character, classification

## Summary

AUX LLM classifies mood-affecting events in user messages. Updates character
mood state in real-time without blocking main generation.

## Design

### Input

Last 2-3 messages for context + current user message.

### System Prompt

```
You are a mood classifier for a roleplay character. Analyze the user
message for events that would affect the character's mood.

Consider: praise, criticism, gifts, threats, bonding, isolation,
success, failure, location safety/danger.

Reply with ONLY a JSON object:
{
  "moodShift": <-20 to +20>,
  "trigger": "positive_event|negative_event|time_decay|relationship_change|location_change|item_received|item_lost",
  "reason": "brief explanation (max 50 chars)",
  "confidence": <0.0-1.0>
}

Rules:
- moodShift is relative to the character's current state
- Negative events: -5 to -20 depending on severity
- Positive events: +5 to +20 depending on severity
- confidence < 0.5 means uncertain — still return your best guess
```

### Output

```typescript
interface MoodClassification {
  moodShift: number; // -20 to +20
  trigger: MoodTrigger;
  reason: string;
  confidence: number; // 0.0-1.0
}
```

### Integration

1. AUX classifies mood shift
2. If confidence >= 0.5, apply to character's `character_mood` table
3. Mood state updates affect expression modifiers
4. Expression modifiers injected into next generation prompt
5. Side effect (DB write) happens async after main response

### Constraints

| Parameter   | Value             |
| ----------- | ----------------- |
| Context     | Last 2-3 messages |
| Max tokens  | 80                |
| Temperature | 0.0               |
| Timeout     | 2s                |
| Fallback    | No mood update    |

## Current State (2026-08-01 review)

| Component                            | Status                                                                                                | Location                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------- |
| `MoodHook` (`mood_shift`)            | ⚠️ keyword-based positive/negative word counting, **no LLM**; doc header claims "Uses the LLM" (stale) | `generation/hooks/mood-hook.ts`  |
| `character_mood` table               | ✅ schema exists                                                                                      | `src/db/schema-character.ts:63`  |
| Mood → expression modifier injection | ❌ not wired from hook `data`                                                                         | —                                |
| Hook event consumption               | ❌ `data.dominantMood`/`delta` never read — `auto-gen.ts` consumes only `hookResult.allowed`          | `generation/auto-gen.ts:412-431` |

Key finding: `mood_shift` events fire but nothing applies them —
no `character_mood` write, no expression modifier, no avatar context.

## Next Actionable Items

1. **Apply hook results** (epic M4): in `auto-gen.ts` post-hook, consume
   `mood_shift` events → write `character_mood` delta (table exists), feed
   `mood` into `AvatarSelectionContext` for avatar scoring.
2. **LLM classification task** (`src/aux-pipeline/tasks/mood.ts`, prompt
   drafted above): auxiliary role via shared runner (M1); replace keyword
   `MoodHook`. Constraints: temp 0.0, maxTokens 80, 2s timeout, confidence >= 0.5 gate.
3. **Align with `TASK-character-mood-happiness`**: happiness meter +
   expression modifiers already in progress (services + routes done) — reuse
   its update path instead of writing a parallel one.
4. **Tests**: unit tests for classification parsing + confidence gate;
   integration test that a `mood_shift` event updates `character_mood`.

## Files to Create

- `src/aux-pipeline/tasks/mood.ts`

## Files to Modify

- `src/aux-pipeline/index.ts` — register mood task
- `src/characters/mood.ts` — add AUX-triggered update function

## Acceptance Criteria

- [ ] Mood classification returns valid JSON
- [ ] Confidence threshold filtering works
- [ ] Mood updates applied to character state
- [ ] Timeout/error → no mood update (graceful)
- [ ] Existing mood tests still pass
