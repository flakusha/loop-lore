# TASK: NPC BDI Planning Loop

**Epic:** epic-agency-story-points, NPC/Actor System
**Priority:** Medium (P6+ deferred)
**Effort:** High
**Status:** Not Started
**Created:** 2026-08-14
**Platform Candidate:** E1 (Agentic NPC autonomy — Inworld AI, generative-agents)
**Research Source:** Stanford generative-agents (2023), BDI architecture patterns

## Summary

Implement BDI (Belief-Desire-Intention) goal-pursuit loop for NPCs: daily planning, task decomposition, reaction system, plan revision, and chat buffer management to prevent infinite conversation loops.

## Background

Research on agentic NPC systems (Inworld AI, generative-agents, Convai) shows that autonomous NPCs need structured goal-pursuit beyond simple state machines. The BDI model provides: daily planning from aspirations, reaction to perceived events, plan revision when interrupted, and chat buffer management to prevent loops.

Extends `TASK-npc-behavior.md` (state machine) with structured goal pursuit.

## Implementation

### Daily Planning Loop
1. Wake-up — determine wake time (personality-based)
2. Daily plan — generate broad-stroke activities
3. Hourly schedule — break into time blocks
4. Task decomposition — break long activities into subtasks
5. Execution — carry out current task
6. Reaction — respond to perceived events
7. Plan revision — update based on what happened

### Schema
```typescript
interface DailyPlan {
  character_id: string;
  date: Date;
  wake_time: Date;
  activities: PlannedActivity[];
  current_activity_index: number;
  status: "planning" | "executing" | "reacting" | "revising";
}

interface PlannedActivity {
  id: string;
  description: string;
  start_time: Date;
  duration_minutes: number;
  location: string;
  subtasks: string[];
  status: "pending" | "active" | "completed" | "interrupted";
  aspiration_id?: string;
}

interface ReactionDecision {
  character_id: string;
  perceived_event: string;
  reaction_mode: "chat" | "wait" | "do_other" | "flee" | "attack" | "ignore";
  reason: string;
  target_id?: string;
  duration_minutes?: number;
}
```

### Chat Buffer Management
```typescript
interface ChatBuffer {
  character_id: string;
  active_conversation?: string;
  message_count: number;
  max_messages: number;        // personality-based
  last_topic: string;
  topic_repetition_count: number;
  status: "engaged" | "disengaging" | "idle";
}
```

## Integration Points
- **TASK-npc-behavior.md** — BDI extends state machine with goal pursuit
- **epic-character-internal-traits.md** — Aspirations drive daily planning
- **TASK-character-mood-happiness.md** — Mood affects plan priorities and reaction mode
- **epic-social-interaction.md** — Social events trigger reactions
- **Memory system** — Episodic memory stores plan outcomes

## Acceptance Criteria
- [ ] NPCs generate daily plans from aspirations
- [ ] Plans decompose into hourly activities with subtasks
- [ ] Perceived events trigger reaction decisions
- [ ] Plans revise when interrupted by events
- [ ] Chat buffer prevents infinite conversation loops
- [ ] Personality affects wake time, plan structure, chat limits
- [ ] Mood influences plan priorities and reaction modes
- [ ] Integration with memory system stores plan outcomes

## Open Questions
1. How often should NPCs replan? (hourly? on significant event?)
2. Should plans persist across sessions or regenerate daily?
3. How to handle NPC-to-NPC plan conflicts (both want same location)?
4. What triggers plan revision vs full replan?
5. Should chat buffer limits vary by personality type?
