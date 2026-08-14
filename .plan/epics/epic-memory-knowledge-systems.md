# Epic: Memory & Knowledge Systems

**Status:** 🟡 Partial (three-tier scopes, budget, extraction, injection, provision, shareability, decay, promotion, purge built)
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** memory, knowledge, three-tier, episodic, semantic, procedural, emotion-impact, character-integration, timescape

## Overview

Three-tier memory system — episodic, semantic, and procedural memory. Covers memory selection UI, lorebook activation, and cross-chat memory persistence. Extended with emotion-impact fields for character behavior integration and timescape-aware memory management.

## Reference

- Spec: `docs/spec/memory-system.md`
- Future features plan: `.plan/future-features-plan.md` (Tier 2)
- Character integration: `epic-character-core-system.md` (Memory Architecture section)
- Character internal traits: `epic-character-internal-traits.md` (coping, mood integration)
- Timeline system: `epic-timeline-system.md` (timeline-aware memory)
- Time scale: `epic-time-scale.md` (game-time memory timestamps)

## Features

| Feature                        | ID           | Effort | Description                                                                 |
| ------------------------------ | ------------ | ------ | --------------------------------------------------------------------------- |
| Three-tier memory              | FEA-2026-052 | High   | Episodic/semantic/procedural per spec                                       |
| Memory selection UI            | FEA-2026-053 | Med    | Mid-chat panel for pinning, selection                                       |
| Lorebook activation            | FEA-2026-054 | Med    | Sticky entries, cooldowns, activation conditions                            |
| Cross-chat memory              | FEA-2026-055 | Med    | Persistent persona/knowledge across workspaces                              |
| Emotion-impact fields          | FEA-2026-056 | Med    | Structured emotion on memories (neutral, sad, angry, grudge, etc.)          |
| Character emotion integration  | FEA-2026-057 | Med    | Memory → mood/coping/relationship integration                               |
| Timescape-aware memory         | FEA-2026-058 | Med    | Game-time timestamps, timeline-specific memory, time-based decay            |
| Reflection/memory synthesis    | FEA-2026-059 | High   | Periodic synthesis of observations into higher-level conclusions (generative-agents pattern) |
| Keyphrase-triggered recall     | FEA-2026-060 | Low-Med | Recall memories by keyphrase match; reliable retrieval for important facts (Kindroid journals pattern) |
| Importance-based scoring       | FEA-2026-061 | High   | Retrieval scoring: recency×importance×relevance (generative-agents/RisuAI HypaMemory) |
| Emotional pattern tracking     | FEA-2026-062 | Med    | Track emotional patterns across conversations; feed into mood system (Kindroid pattern) |

## Emotion-Impact Fields (FEA-2026-056)

Structured emotion-impact on episodic memories that drives character behavior:

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

**Behavior:**
- `momentary` emotions affect mood temporarily (happiness ±intensity)
- `lasting` emotions persist across sessions, decay over time
- `permanent` emotions (trauma, grudge) never decay, always in prompt
- `triggers_coping: true` activates coping profile when memory is retrieved

## Character Emotion Integration (FEA-2026-057)

Memory → Character system integration points:

| Memory Field                    | Character System    | Integration                                                       |
| ------------------------------- | ------------------- | ----------------------------------------------------------------- |
| `emotion_impact.emotion`        | Mood service        | `momentary` → happiness ±intensity                                |
| `emotion_impact.emotion`        | Coping profile      | `triggers_coping` → activate coping style                         |
| `emotion_impact.target`         | Relationship service| Update relationship strength based on emotion                     |
| `emotion_impact.duration`       | Prompt assembly     | `lasting`/`permanent` → inject into prompt                        |
| `emotion_impact.triggers_coping`| Behavioral dimensions| Activate coping/approach/autonomy                               |

**Prompt assembly integration:**
- `permanent` emotions always emitted in character prompt
- `lasting` emotions emitted when intensity > threshold (e.g., > 30)
- `momentary` emotions only emitted if recent (within last N game-days)

## Timescape-Aware Memory (FEA-2026-058)

Memory timestamps aligned with world/game time:

| Memory Field | Time System    | Integration                                                      |
| ------------ | -------------- | ---------------------------------------------------------------- |
| `timestamp`  | World time     | Store as game-time, not real-time                                |
| `timestamp`  | Timeline system| Link to `timeline_id` for timeline-specific memories             |
| `decay_rate` | Time scale     | Decay per game-day, not real-day                                 |
| `duration`   | Time progression| `permanent` memories survive time compression                   |

**Timeline integration:**
- Memories tagged with `timeline_id` for timeline-specific recall
- Cross-timeline memories (GM-created lore) can propagate per `epic-memory-propagation.md` rules
- Time compression (e.g., 1 game-hour = 1 real-minute) affects decay rates proportionally

## Acceptance Criteria

- [ ] Three-tier memory system implemented
- [ ] Memory selection UI functional
- [ ] Lorebook activation with cooldowns works
- [ ] Cross-chat memory persists across workspaces
- [ ] Emotion-impact fields on episodic memories
- [ ] Memory → mood integration (momentary emotions affect happiness)
- [ ] Memory → coping integration (triggers_coping activates coping profile)
- [ ] Memory → relationship integration (emotion target updates relationship strength)
- [ ] Game-time timestamps on memories (not real-time)
- [ ] Timeline-specific memory recall
- [ ] Time-based decay (per game-day, not real-day)
- [ ] Permanent emotions survive time compression

## Dependencies

- `actor_memories` table (existing)
- Memory system spec (`docs/spec/memory-system.md`)
- `epic-character-core-system.md` (Memory Architecture section — emotional_valence field)
- `epic-character-internal-traits.md` (coping profile, mood integration)
- `epic-timeline-system.md` (timeline_id column, timeline branching)
- `epic-time-scale.md` (game-time progression, time compression)
- `epic-memory-propagation.md` (cross-timeline memory scopes)

## Integration Points

### Systems This Epic Depends On

| System                    | What It Provides                          | How Used                                    |
| ------------------------- | ----------------------------------------- | ------------------------------------------- |
| Character Core System     | emotional_valence field, mood service     | Memory emotion → character mood integration |
| Character Internal Traits | Coping profile, behavioral dimensions     | Memory triggers coping mechanisms           |
| Timeline System           | timeline_id, timeline branching           | Timeline-specific memory recall             |
| Time Scale                | Game-time progression, time compression   | Memory timestamps, decay rates              |
| Memory Propagation        | Cross-timeline memory scopes              | Memory isolation and propagation rules      |

### Systems That Depend On This Epic

| System                    | What It Consumes                          | How Used                                    |
| ------------------------- | ----------------------------------------- | ------------------------------------------- |
| Character Internal Traits | Memory emotion-impact                     | Coping activation based on memory retrieval |
| Prompt Assembly           | Permanent/lasting emotions                | Inject into character prompt                |
| Relationship Service      | Memory emotion target                     | Update relationship strength                |
| Mood Service              | Momentary emotions                        | Temporary happiness changes                 |

### Shared Data Contracts

| Contract              | Shared With                | Purpose                                    |
| --------------------- | -------------------------- | ------------------------------------------ |
| MemoryEmotionImpact   | Character Core System      | Emotion type, intensity, target, duration  |
| EmotionImpact enum    | Character Internal Traits  | Emotion types that trigger coping          |
| timeline_id           | Timeline System            | Timeline-specific memory scoping           |

### Cross-System Events

| Event                  | Direction | Purpose                                              |
| ---------------------- | --------- | ---------------------------------------------------- |
| memory.created         | emits     | Notify character system of new memory with emotion   |
| memory.emotion.trigger | emits     | Trigger coping profile when memory retrieved         |
| memory.decay.tick      | subscribes| Time-scale system triggers memory decay per game-day |
| mood.changed           | subscribes| Character mood changes affect memory retrieval weight|
