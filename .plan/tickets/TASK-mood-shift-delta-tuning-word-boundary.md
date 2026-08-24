<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: MoodHook — word-boundary matching + intensity-scaled delta

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** Small
**Epic:** epic-emotion-avatar-message-binding
**Related:** TASK-aux-mood-classification.md, BUG-emotion-mood-hook-stale-llm-javadoc.md, src/generation/hooks/mood-hook.ts, src/generation/hooks/emotion-hook.ts, src/characters/services/mood-service/apply-happiness-delta.ts, src/generation/hooks/moderation-hook.ts

## Summary

`src/generation/hooks/mood-hook.ts:46-87` uses `String.includes()` to match
mood keywords — substring matches cause false positives ("unhappy" matches
the positive word "happy", "greatly" matches "sad" via the "ate" inside it).
The hardcoded ±5 delta at line 102-114 ignores intensity, decay, and the
character's mood stability (which `applyHappinessDelta` does scale at
`apply-happiness-delta.ts:40`, but only as a multiplier on a constant).

Both `EmotionHook` (`emotion-hook.ts:80-87`) and `ModerationHook`
(`moderation-hook.ts:11-13`, `156-169`) face the same substring-vs-token
question; the moderation hook already documents the tokenized pattern.

## Context

The mood-shift event drives `character_mood.happiness` via
`MoodService.applyHappinessDelta(actorId, worldId ?? undefined, moodShiftDelta)`
called from `src/generation/auto-gen/post-store.ts:85-91`. Stability scaling
exists downstream — `apply-happiness-delta.ts:40`:

```ts
const effectiveDelta = delta * (1 - mood.moodStability * 0.5);
```

…so a high-stability character with `moodStability = 0.8` receives a delta
of `±5 * 0.6 = ±3`. That's reasonable, but two issues remain:

1. **Delta has no intensity signal**. A single positive word ("glad")
   and a paragraph of ecstatic praise ("ecstatic", "grateful", "thankful",
   "excited", "cheerful", "glad") produce the same `+5`. The hook should
   weight delta by:
   - **Indicator count** — more positive words → larger positive delta
   - **Dominant-mood dominance ratio** — `positive / (positive + negative + neutral)`
     could scale delta within `[1.0, 2.5]`
   - **Existing world-scope context** — `worldId` is already plumbed through
     `post-store.ts:87`, but the hook has no awareness of it (no decay across
     mood events in the same world, no per-world baseline)

2. **Substring false-positives**:
   - "unhappy" → matches "happy" (positive) and "sad" (no "sad" substring
     in "unhappy" — actually only "happy" matches). Result: "I'm unhappy"
     is read as positive.
   - "greatly" → matches no word but "great" might be added later and
     would false-positive.
   - "excitement" / "excited" — only "excited" is in the list, so "excitement"
     doesn't fire. Border case.

   `ModerationHook` already solves this with whole-word tokenization
   (`moderation-hook.ts:11-13`, `156-169`): split content into tokens,
   count exact matches. Reusing this pattern would fix the false positives
   and improve detection precision.

## Proposed Fix

### Phase 1 — word-boundary matching (low risk, high value)

1. Extract a shared `tokenize(content: string): string[]` helper into
   `src/generation/hooks/_tokenize.ts` (or a sibling module if the codebase
   has a preferred location — check `src/utils` first).
2. In `mood-hook.ts:detectMoodIndicators`, replace
   `lower.includes(word,)` with `tokens.includes(word,)` after tokenization.
3. Same for `emotion-hook.ts:detectEmotions` (`lower.includes(keyword,)` →
   `tokens.includes(keyword,)`).
4. Add tests in `hooks.test.ts`:
   - "I'm unhappy" → 0 positive indicators (no longer triggers "happy")
   - "unhappiness" → 0 indicators (none of the listed words match as tokens)
   - "greatly" → 0 indicators (no "great" word in list, but verified to
     not match via substring either — regression guard)
   - All existing positive/negative test cases still pass.

### Phase 2 — intensity-scaled delta (medium risk, medium value)

1. Change `MoodHook.calculateMoodDelta` from a fixed ±5 to:
   ```ts
   private calculateMoodDelta(dominant: string, totalIndicators: number, dominanceRatio: number,): number {
     if (dominant === "neutral") return 0;
     const base = dominant === "positive" ? 3 : -3;
     // Scale by indicator count (diminishing returns)
     const intensity = Math.min(1 + Math.log2(totalIndicators), 2.5);
     // Scale by dominance (avoid "barely positive" → small delta)
     const confidence = 0.5 + 0.5 * dominanceRatio;
     return Math.round(base * intensity * confidence);
   }
   ```
2. Pass `totalIndicators` and `dominanceRatio` from `execute()`.
3. Update `MoodHook.data` to include `intensity` and `dominanceRatio` so
   consumers can audit / log the signal.
4. Add tests covering the scaling: 1 indicator = ±3 (base), 3 indicators = ±4-5,
   8 indicators = ±6-7 (capped).

### Phase 3 — world-scoped decay (defer)

The hook is called once per generation; multi-event decay within a world
session belongs in `MoodService` itself, not the hook. Track as a separate
TASK if/when `MoodService` gains per-world decay API.

## Acceptance Criteria

- [ ] Phase 1: substring false-positives eliminated for "unhappy" / "excitement"
      and similar.
- [ ] Phase 1: emotion-hook + mood-hook share the tokenize helper.
- [ ] Phase 2: delta magnitude scales with indicator count + dominance ratio.
- [ ] Phase 2: existing post-store persistence wiring unchanged (still calls
      `MoodService.applyHappinessDelta(actorId, worldId, delta)`).
- [ ] Tests cover all three phases; existing `hooks.test.ts` cases still pass.
- [ ] `bun run check` + `bun test src/generation/hooks/` green.