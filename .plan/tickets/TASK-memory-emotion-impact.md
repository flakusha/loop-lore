<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Memory Emotion-Impact Fields

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-memory-knowledge-systems
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability
**Priority:** Medium
**Effort:** Medium
**Status:** Done
**Status Note:** 2026-11-09 reconcile: shipped — `EmotionImpact`/`MemoryEmotionImpact` in `src/memory/types.ts:39,55`, `emotion_impact` column (migration `069_actor_memories_emotion_impact.ts:9`), sanitize/parse in `src/memory/emotion-impact.ts` with tests (`emotion-impact.test.ts`), budget-tier touchpoint (`budget.ts:14,32`).

**Summary:**
Add structured emotion-impact fields to episodic memories that drive character behavior. Replaces the single `emotional_valence` scalar with a structured `MemoryEmotionImpact` type.

## Requirements

### Schema

```typescript
type EmotionImpact =
  | "neutral"        // no emotional charge
  | "happy"          // positive experience
  | "sad"            // loss, disappointment
  | "angry"          // frustration, injustice
  | "afraid"         // fear, threat
  | "disgusted"      // revulsion, moral rejection
  | "surprised"      // unexpected event
  | "grudge"         // sustained resentment (higher priority than angry)
  | "grateful"       // sustained positive (higher priority than happy)
  | "traumatized"    // deep negative (highest priority, affects coping)
  | "nostalgic"      // bittersweet positive
  | "embarrassed";   // shame, social discomfort

interface MemoryEmotionImpact {
  emotion: EmotionImpact;
  intensity: number;        // 0–100: how strong the emotion
  target?: string;          // who/what the emotion is directed at (character ID, event, location)
  duration: "momentary" | "lasting" | "permanent"; // how long it affects behavior
  decay_rate?: number;      // how fast intensity decays (per game-day); 0 = permanent
  triggers_coping?: boolean; // does this memory trigger coping mechanisms?
}
```

### Behavior

- `momentary` emotions affect mood temporarily (happiness ±intensity)
- `lasting` emotions persist across sessions, decay over time
- `permanent` emotions (trauma, grudge) never decay, always in prompt
- `triggers_coping: true` activates coping profile when memory is retrieved

## Tasks

- [ ] Add `EmotionImpact` type to `src/memory/types.ts`
- [ ] Add `MemoryEmotionImpact` interface to `src/memory/types.ts`
- [ ] Add `emotion_impact` field to episodic memory schema
- [ ] Migration: add `emotion_impact` column to `actor_memories` table
- [ ] Update `db:sync-types` and `db:sync-manifest`
- [ ] Validation: validate emotion-impact fields on memory creation
- [ ] Tests: schema validation, emotion-impact behavior

## Dependencies

- `epic-character-core-system.md` (existing `emotional_valence` field)
- `epic-character-internal-traits.md` (coping profile integration)

**Acceptance Criteria:**
- [x] `EmotionImpact` type defined
- [x] `MemoryEmotionImpact` interface defined
- [x] `emotion_impact` field on episodic memories
- [x] Migration applied
- [x] Validation passes
- [x] Tests pass
