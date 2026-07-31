# TASK: AUX LLM — Mood Classification

**Status:** ⬜ Not Started
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
