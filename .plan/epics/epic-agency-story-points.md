<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Player Agency — Story Points

**Tags:** agency, story-points, meta-currency, reroll, player-control, bdi, npc, goal-pursuit, emergent-narrative, prompt-assembly
**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** In Progress (verified 2026-10-18 against `dev` at `08ef7efe7` — by file existence on `dev`, line-level reads of each cited path, and a `git log dev..<branch>` check that excludes unmerged work). This file previously contradicted itself: the `**Status:**` field read `Not Started` while the note immediately below described shipped code. The field was the false half. SHIPPED AND LIVE: the `actor_story_points` table (`src/db/migrations/019_actor_story_points.ts`) plus the partial-unique follow-up `020_actor_story_points_partial_unique.ts`; the earn/spend/balance service split across `src/services/agency/story-points/{mutations,queries,types,index}.ts`; the HTTP surface — `GET /api/agency/balance`, `POST /api/agency/spend`, `POST /api/agency/earn` assembled by the barrel `src/routes/agency/index.ts:29` and mounted LIVE at `src/app/register-plugins.ts:61` (`app.use(agencyRoutes(...))`, NOT `elysia-app.ts`); the generation-pipeline hook `chargeStoryPointsForChat` (`src/services/agency/spend-helpers.ts:122`) consumed by the regenerate (`src/generation/generation-routes/regenerate.ts:172`) and retry (`retry.ts:67`) routes; and the chat UI affordance `src/components/chat/story-points-chip.html`, mounted from `src/views/chat.html:63`. Unit tests ship for each layer (`src/services/agency/story-points.test.ts`, `src/routes/agency/{spend,balance,earn}.test.ts`, `src/db/020_actor_story_points_partial_unique.test.ts`). REMAINS: earn hooks are not wired — nothing credits points from roleplay signal, arc completion, or in-world achievement, so balances move only through explicit service calls (`TASK-story-points-prototype` records the same gap); spend validation rules, the generation-pipeline hook CONTRACT and the gradient (non-binary) point levels are all still open in `TASK-storypoints-acceptance`; and the NPC goal-pursuit table in §Tasks is superseded and reference-only (see the BDI scope note in §Related) — it ships under `epic-research-agency-decision.md` and its `Not Started` rows there are historical, not this epic's scope.
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

> **REFERENCE ONLY — do not implement from this table.** The NPC goal-pursuit task table below is superseded: implemented under `epic-research-agency-decision.md` (see BDI scope note in §Related).

| Task | Description | Priority | Status |
|------|-------------|----------|--------|
| `TASK-npc-bdi-planning` | BDI goal-pursuit loop: daily planning, task decomposition, reaction, plan revision, chat buffer | High | Not Started |
| `TASK-npc-social-conversation` | NPC initiates social conversations based on proximity, mood, relationship | Medium | Not Started |
| `TASK-npc-social-decision` | NPC decides how to react: chat / wait / flee / attack / ignore | Medium | Not Started |
| `TASK-npc-social-memory` | NPC stores conversation outcomes in episodic memory | Medium | Not Started |
| `TASK-npc-social-dynamics` | NPC-to-NPC social dynamics: information propagation, relationship drift | Medium | Not Started |
| `TASK-npc-to-npc-social` | Full autonomous NPC-to-NPC social simulation with emergent gossip | Medium | Not Started |
| `TASK-npc-social-prompt` | Prompt assembly for NPC social reasoning | Medium | Not Started |
| `TASK-npc-social-tests` | Planning, reaction, revision, buffer, social tests | High | Not Started |
| `TASK-npc-planning-loop` | Implement daily planning + task decomposition | High | Not Started |
| `TASK-npc-reaction-system` | Event perception + reaction decision system | High | Not Started |
| `TASK-npc-plan-revision` | Dynamic plan adjustment based on events | Medium | Not Started |
| `TASK-npc-chat-buffer` | Chat cooldown and buffer management | Medium | Not Started |
| `TASK-npc-planning-prompt` | Prompt assembly for planning and reactions | High | Not Started |
| `TASK-npc-planning-tests` | Planning, reaction, revision, buffer tests | High | Not Started |

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

(status verified 2026-10-18 against `dev`)

- TASK-story-points-prototype — In Progress (schema, service, spend hook and UI chip ship; earn hooks deferred)
- Schema: `actor_story_points` table (per actor/world) — SHIPPED (migrations `019_actor_story_points.ts` + `020_actor_story_points_partial_unique.ts`); acceptance open in `TASK-storypoints-acceptance.md`
- UI: spend affordance in chat input — SHIPPED (`src/components/chat/story-points-chip.html`, mounted at `src/views/chat.html:63`)
- Hook into generation pipeline (bias / retry path) — SHIPPED (`chargeStoryPointsForChat` at `src/services/agency/spend-helpers.ts:122`, consumed by `regenerate.ts:172` and `retry.ts:67`)
- Earn hooks (roleplay signal / arc completion / achievement) — NOT WIRED
- Spend validation rules + gradient levels — open in `TASK-storypoints-acceptance`

## Spec Alignment

- `docs/spec/agency-story-points.md` — authoritative for `actor.properties.storyPoints`: earn paths (trait roleplay, arc completion, in-world achievements) and spend paths (reroll, aspect invoke, twist, generation retry, memory/lorebook bias) plus the `/agency` UI spend affordance this epic's chat-input hook implements.
- `docs/spec/autonomy-determinism.md` — seed/jitter contract governs the BDI reflection pass (`bdi-nightly.ts` / `bdi-reflection.ts`); reflection timing MUST use seeded jitter, never wall-clock randomness.
- `docs/spec/npcs.md` — `npc_states` is the Belief layer for the BDI table above (semantic memory + world state); plan/reaction writes land there, not in ad-hoc tables.

## Related

Autonomy orchestration + rate governance (scheduler, budgets, kill switch): `epic-actor-autonomy-story-drive.md` — BDI decisions are dispatched by that loop. Backlink confirmed: autonomy Related cites this epic as its BDI loop host.

`epic-rpg-mechanics.md`, `epic-assistant-generation-extensions.md`,
`epic-emergent-narrative-design.md`

> **BDI scope note (2026-09-26):** the NPC goal-pursuit loop sketched above
> (§NPC Goal-Pursuit Loop) is implemented under `epic-research-agency-decision.md`
> (migration 011, `src/services/agency/bdi-nightly.ts`, `bdi-reflection.ts`,
> `TASK-agency-bdi-reflection-cycle`). This epic keeps the story-points
> meta-currency scope; the NPC task table in §Tasks is reference only.

## Linked Tasks

- TASK-agency-story-points — schema ships (migration 019); earn/spend/balance service implemented; spend validation + pipeline hook open in TASK-storypoints-acceptance
- `TASK-storypoints-acceptance.md` — spend validation, generation-pipeline hook, gradient levels (open)
- `TASK-http-expose-agency-earn-and-status-alongside-spend.md` — POST /api/agency/earn + GET /api/agency/balance wired (closed)
- `TASK-npc-planning-prompt.md` — superseded by epic-research-agency-decision.md (closed)
- `TASK-npc-planning-tests.md` — superseded by epic-research-agency-decision.md (closed)
- `TASK-rpg-player-agency-story-points.md` — duplicate of TASK-agency-story-points (closed)
- `FEAT-fate-aspects-system-invocable-lore.md` — duplicate, closed
