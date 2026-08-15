# TASK: Emotional Pattern Tracking in Memory

**Epic:** epic-memory-knowledge-systems
**Priority:** Medium (matrix G31 — agentic addendum; not P6-blocked)
**Effort:** Medium
**Status:** Not Started
**Created:** 2026-08-15
**Platform Candidate:** E2 (Kindroid — emotional pattern tracking)
**Research Source:** Kindroid emotional pattern tracking
**Related:** G31 (Agent Memory Scoring ↔ Emotion Impact), TASK-agent-memory-scoring.md, TASK-memory-emotion-impact.md

## Summary

Track recurring emotional patterns in a character's episodic memories and surface them
as behavioral signals. Detects repeated emotional themes (frequent grudge events,
chronic fear, recurring gratitude) from `MemoryEmotionImpact` data so memory scoring
and mood systems can react.

## Background

The matrix identifies G31: agent memory scoring needs emotional valence, and emotion
impact exists (`TASK-memory-emotion-impact.md`) but has no scoring/pattern integration.
Kindroid's emotional pattern tracking shows recurring valence patterns are a strong
character-behavior signal. Extends `FEAT-memory-systems-three-tier.md` + scored
retrieval (`TASK-agent-memory-scoring.md`) with pattern recognition.

## Requirements

### Pattern detection

```typescript
interface EmotionPattern {
  type: EmotionImpact;       // dominant valence
  frequency: number;         // occurrences per window
  windowDays: number;        // observation window (game time)
  trend: "rising" | "steady" | "fading";
  lastOccurred: string;      // ISO timestamp
}
```

- Aggregate `MemoryEmotionImpact` per character over sliding windows
- Emit pattern summary for scoring boosts (G31) and mood/coping services (G24)

### Integration

- Memory scoring: emotional memories get importance boost (G31 cross-ref)
- Mood system: patterns feed mood/happiness drift (G28/G34 family)

## Acceptance Criteria

- [ ] EmotionPattern aggregation over sliding windows
- [ ] Trend detection (rising/steady/fading)
- [ ] Pattern data consumed by memory scoring (G31)
- [ ] Pattern data exposed to mood/coping services (G24)
- [ ] Tests: pattern aggregation + trend detection

## Notes

Ticket created 2026-08-15 during `.plan/` reconciliation (matrix referenced
`TASK-memory-happiness-patterns.md` but no file existed; flagged "needs ticket" in
`backlog/priority.md` P6-D).
