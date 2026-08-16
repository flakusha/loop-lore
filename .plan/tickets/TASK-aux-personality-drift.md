<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: AUX LLM — Personality Drift Check

**Status:** ⬜ Not Started
**Priority:** P2-C (deferred)
**Effort:** Small
**Epic:** epic-aux-enrichment-pipeline
**Tags:** aux-llm, personality, character, drift

## Summary

AUX LLM checks if AI character responses drift from defined personality.
Opt-in per character. Logs drift events, optionally triggers correction.

## Design

### Input

Character definition (traits, personality) + assistant response.

### System Prompt

```
You are a personality drift checker for an AI character. Compare the
character's response to their defined personality traits.

Character traits: {{character_traits}}

Analyze the response for:
- Tone mismatch (e.g., cheerful character being somber)
- Verbosity mismatch (e.g., terse character being verbose)
- Value contradiction (e.g., honest character lying)
- Behavioral inconsistency (e.g., cautious character being reckless)

Reply with ONLY a JSON object:
{
  "drift": <0.0-1.0>,
  "axis": "tone|verbosity|values|behavior|none",
  "suggestion": "how to correct (max 50 chars, or empty if no drift)"
}

Rules:
- drift 0.0 = no drift, 1.0 = severe drift
- drift < 0.3 = acceptable, no correction needed
- axis "none" means no significant drift
- suggestion only non-empty when drift >= 0.3
```

### Output

```typescript
interface PersonalityDrift {
  drift: number; // 0.0-1.0
  axis: string; // "tone|verbosity|values|behavior|none"
  suggestion: string; // correction suggestion or empty
}
```

### Integration

1. After main generation, AUX checks personality drift
2. If drift >= 0.5, log warning event
3. If drift >= 0.7, optionally trigger re-generation with correction
4. Drift events visible in GM panel for monitoring
5. **Opt-in only**: character must have `personality_check: true`

### Constraints

| Parameter   | Value                                              |
| ----------- | -------------------------------------------------- |
| Context     | Character definition + last 2 messages             |
| Max tokens  | 80                                                 |
| Temperature | 0.0                                                |
| Timeout     | 2s                                                 |
| Fallback    | No drift check                                     |
| Activation  | Only for characters with `personality_check: true` |

## Files to Create

- `src/aux-pipeline/tasks/personality.ts`

## Files to Modify

- `src/aux-pipeline/index.ts` — register personality task
- `src/characters/spec.ts` — add `personality_check` flag

## Acceptance Criteria

- [ ] Drift check returns valid JSON
- [ ] Only runs for opted-in characters
- [ ] Drift events logged for GM monitoring
- [ ] High drift optionally triggers re-generation
- [ ] Timeout/error → no drift check (graceful)
- [ ] Existing personality tests still pass
