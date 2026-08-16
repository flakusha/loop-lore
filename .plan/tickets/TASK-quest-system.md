<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Quest System Implementation

**Epic:** RPG Mechanics & Extensible Game Systems
**Priority:** High
**Effort:** Large
**Status:** Not Started

## Summary

Implement comprehensive quest system with main quests, side quests, connection to other systems, and story end conditions.

## Quest Types

### Main Quests

- Primary story arc quests
- Sequential progression
- Major story milestones
- Critical path quests

### Side Quests

- Optional quests
- Parallel progression
- World-building quests
- Character development quests

### Connection to Other Systems

- Link quests to character stats
- Link quests to inventory/items
- Link quests to skills/abilities
- Link quests to achievements
- Link quests to world state

### Story End Conditions

- Quest completion (success)
- Quest failure (conditions not met)
- Party death (all members dead)
- Time limit exceeded
- Player choice (abandon)
- Story branch (alternative path)

## Design

### Quest Structure

```typescript
interface Quest {
  id: string;
  type: "main" | "side" | "daily" | "weekly";
  title: string;
  description: string;
  objectives: QuestObjective[];
  rewards: QuestReward[];
  prerequisites: QuestPrerequisite[];
  timeLimit?: number; // seconds
  status: "available" | "active" | "completed" | "failed" | "abandoned";
  storyEndCondition: StoryEndCondition;
}

interface QuestObjective {
  id: string;
  type: "kill" | "collect" | "talk" | "explore" | "craft" | "custom";
  target: string;
  count: number;
  current: number;
  completed: boolean;
}

interface StoryEndCondition {
  type: "success" | "failure" | "party_dead" | "time_limit" | "abandoned" | "branch";
  conditions: Record<string, unknown>;
  consequences: QuestConsequence[];
}
```

### Quest State Machine

```
Quest States:
├── available — quest can be accepted
├── active — quest is in progress
├── completed — quest successfully finished
├── failed — quest failed (conditions not met)
├── abandoned — quest abandoned by player
└── expired — quest time limit exceeded
```

### Quest Chains

```typescript
interface QuestChain {
  id: string;
  name: string;
  quests: string[]; // ordered quest IDs
  currentIndex: number;
  status: "active" | "completed" | "failed";
}
```

## Tasks

- [x] Design quest data model
- [x] Implement quest state machine
- [x] Implement main quest system
- [ ] Implement side quest system
- [x] Implement quest objectives tracking
- [x] Implement quest rewards
- [ ] Implement quest prerequisites
- [ ] Implement story end conditions
- [ ] Implement quest chains
- [ ] Connect quests to character stats
- [ ] Connect quests to inventory
- [ ] Connect quests to skills
- [ ] Connect quests to achievements
- [ ] Implement quest UI components
- [x] Write tests for quest system

## Files

- `src/rpg/quests/service.ts` — quest service (✅ created)
- `src/rpg/quests/index.ts` — public API (✅ created)
- `src/rpg/quests/service.test.ts` — tests (✅ created)
- `src/rpg/quest-chains.ts` — quest chains (TODO)
- `src/routes/quests.ts` — quest API (TODO)
- `src/frontend/rpg/quests/` — quest UI (TODO)
