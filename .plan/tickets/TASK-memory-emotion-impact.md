# TASK: Memory Emotion-Impact Fields

**Epic:** `epic-memory-knowledge-systems.md` (FEA-2026-056)
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started

## Summary

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

## Acceptance Criteria

- [ ] `EmotionImpact` type defined
- [ ] `MemoryEmotionImpact` interface defined
- [ ] `emotion_impact` field on episodic memories
- [ ] Migration applied
- [ ] Validation passes
- [ ] Tests pass
