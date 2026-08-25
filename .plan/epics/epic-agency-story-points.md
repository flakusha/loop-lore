<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Player Agency — Story Points

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Source:** .plan/epics/epic-rpg-patterns.md §6.4, §6.7, §9

## Summary

Borrow **Bennies / Fate Points / Inspiration**: a player-earned meta-currency spent to
reroll, invoke an aspect, or narratively edit the story / steer generation. Gives
chat-RPG players agency without breaking the LLM's authorial role — the player becomes a
causal agent (emergent narrative, §6.7) rather than a passive reader.

## Mechanics

- **Earn:** good roleplay of character traits, completing arcs, in-world achievements.
- **Spend:** reroll a resolution; inject a "twist" the LLM must honor; retry a
  generation; bias memory/lorebook injection.
- **Non-binary:** points are a gradient, not a binary unlock (see
  epic-emergent-narrative-design).

## NPC Goal-Pursuit Loop (Extension — Research-Driven)

The Stanford Generative Agents paper demonstrates that NPCs can pursue goals
autonomously through a planning-execution-reaction loop. This is distinct from
player agency (story points) — it is NPC agency: the character's ability to
act independently toward their aspirations.

### BDI Architecture (Belief-Desire-Intention)

The classic BDI model from AI research provides the foundation:

| Component | What it represents | Loop-lore mapping |
| --------- | ------------------ | ----------------- |
| **Belief** | What the character knows/believes | Semantic memory + world state |
| **Desire** | What the character wants | Aspirations (from internal-traits epic) |
| **Intention** | What the character plans to do | Active plan steps |

### Daily Planning Loop

NPCs generate and refine daily plans using a planning loop:

1. **Wake-up** — determine when the character wakes (based on personality)
2. **Daily plan** — generate broad-stroke activities for the day
3. **Hourly schedule** — break daily plan into hourly blocks
4. **Task decomposition** — break long activities into smaller tasks
5. **Execution** — carry out the current task
6. **Reaction** — respond to perceived events (conversations, threats, opportunities)
7. **Plan revision** — update the plan based on what happened

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
  subtasks: string[];          // decomposed tasks
  status: "pending" | "active" | "completed" | "interrupted";
  aspiration_id?: string;      // which aspiration this serves
}
```

### Reaction System

When NPCs perceive events, they decide how to react:

1. **Event focus** — choose which event to react to (if multiple)
2. **Reaction mode** — "chat with", "wait", "do other things", "flee", "attack"
3. **Execution** — carry out the reaction
4. **Memory update** — store the interaction in episodic memory

```typescript
interface ReactionDecision {
  character_id: string;
  perceived_event: string;
  reaction_mode: "chat" | "wait" | "do_other" | "flee" | "attack" | "ignore";
  reason: string;
  target_id?: string;          // who to react to
  duration_minutes?: number;   // how long to wait
}
```

### Chat Buffer Management

To prevent infinite conversation loops, NPCs maintain a chat buffer:

```typescript
interface ChatBuffer {
  character_id: string;
  last_chat_time: Date;
  last_chat_partner: string;
  last_chat_topic: string;
  cooldown_minutes: number;    // min time between chats with same partner
  max_consecutive_chats: number; // max chats before forced break
}
```

### Plan Revision

NPCs revise their plans when:
1. **Goal achieved** — aspiration completed, remove from plan
2. **Goal blocked** — aspiration cannot be pursued, find alternative
3. **New opportunity** — better path to goal discovered
4. **External event** — world change requires plan adjustment
5. **Mood shift** — emotional state changes priorities

```typescript
interface PlanRevision {
  character_id: string;
  timestamp: Date;
  reason: string;
  old_plan: PlannedActivity[];
  new_plan: PlannedActivity[];
  aspiration_changes: Array<{
    aspiration_id: string;
    old_priority: number;
    new_priority: number;
  }>;
}
```

### Integration with Internal Traits

The goal-pursuit loop consumes data from the internal traits epic:

- **Aspirations** (D3) — define what the character wants
- **Autonomy** (D9) — determines how independently they pursue goals
- **Coping** (D7) — influences how they handle setbacks
- **Approach** (D8) — determines their method of achieving goals

### Prompt Assembly

When generating NPC plans and reactions, the prompt includes:
1. **Current aspirations** — what does the character want?
2. **Active plan** — what are they currently doing?
3. **Recent events** — what just happened?
4. **Relationship context** — who is nearby and how do they feel about them?
5. **Mood state** — how are they feeling right now?
6. **Autonomy preference** — how independently should they act?

### Tasks

| Task | Description | Priority | Status |
|------|-------------|----------|--------|
| TASK-npc-planning-loop | Implement daily planning + task decomposition | High | Not Started |
| TASK-npc-reaction-system | Event perception + reaction decision system | High | Not Started |
| TASK-npc-plan-revision | Dynamic plan adjustment based on events | Medium | Not Started |
| TASK-npc-chat-buffer | Chat cooldown and buffer management | Medium | Not Started |
| TASK-npc-planning-prompt | Prompt assembly for planning and reactions | High | Not Started |
| TASK-npc-planning-tests | Planning, reaction, revision, buffer tests | High | Not Started |

### Open Questions

1. Should NPC plans be visible to players, or only their actions?
2. How should NPCs handle conflicting goals (multiple high-priority aspirations)?
3. Should NPCs be able to coordinate plans with allies?
4. How should NPC planning scale with world complexity?
5. Should NPCs be able to abandon plans mid-execution, or must they complete current tasks?

## Why (from research)

- Savage Worlds / FATE / D&D Inspiration proven in TTRPGs (§6.4).
- Pairs with emergent narrative (MDA): players steer without over-determining the story.

## Tasks

- TASK-story-points-prototype
- Schema: `actor_story_points` table (per actor/world)
- UI: spend affordance in chat input
- Hook into generation pipeline (bias / retry path)

## Related
Autonomy orchestration + rate governance (scheduler, budgets, kill switch): `epic-actor-autonomy-story-drive.md` — BDI decisions are dispatched by that loop.

`epic-rpg-mechanics.md`, `epic-assistant-generation-extensions.md`,
`epic-emergent-narrative-design.md`

## Linked Tasks

- TASK-agency-story-points.md
