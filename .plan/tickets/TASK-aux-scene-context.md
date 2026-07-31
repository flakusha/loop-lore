# TASK: AUX LLM — Scene Context Extraction

**Status:** ⬜ Not Started
**Priority:** P2-C (deferred)
**Effort:** Small
**Epic:** epic-aux-enrichment-pipeline
**Tags:** aux-llm, scene, context, prompt-enrichment

## Summary

AUX LLM extracts scene context from recent messages for prompt enrichment.
Summarizes current state before main generation call.

## Design

### Input

Last 3-5 messages for context.

### System Prompt

```
You are a scene context extractor for a roleplay chat. Summarize the
current scene state from recent messages.

Reply with ONLY a JSON object:
{
  "location": "current location name or null",
  "weather": "current weather or null",
  "timeOfDay": "morning|afternoon|evening|night|unknown",
  "participants": ["character1", "character2"],
  "mood": "tense|relaxed|exciting|dangerous|peaceful|unknown",
  "activeQuests": ["quest description or null"]
}

Rules:
- Use "unknown" when uncertain
- Keep participant list to active speakers only
- activeQuests from context clues, not explicit tracking
```

### Output

```typescript
interface SceneContext {
  location: string | null;
  weather: string | null;
  timeOfDay: string;
  participants: string[];
  mood: string;
  activeQuests: string[];
}
```

### Integration

1. Before main generation, AUX extracts scene context
2. Scene context injected into system prompt as `<scene_context>` section
3. Helps main model maintain consistency
4. Runs every N messages (configurable, default: 5)

### Token Budget

| Component             | Tokens   |
| --------------------- | -------- |
| System message        | ~150     |
| Recent messages (3-5) | ~600     |
| **Total input**       | **~750** |
| Response              | ~150     |
| **Total**             | **~900** |

## Files to Create

- `src/aux-pipeline/tasks/scene-context.ts`

## Files to Modify

- `src/aux-pipeline/index.ts` — register scene context task
- `src/assistant/prompt-assembler.ts` — inject scene context section

## Acceptance Criteria

- [ ] Scene extraction returns valid JSON
- [ ] Scene context injected into prompt
- [ ] Runs every N messages (configurable)
- [ ] Handles missing/unknown values gracefully
- [ ] Timeout/error → no scene context (graceful)
- [ ] Existing prompt assembly tests still pass
