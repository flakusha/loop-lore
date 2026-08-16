<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Quest State Management

**Epic:** RPG Mechanics & Extensible Game Systems
**Priority:** High
**Effort:** Large
**Status:** Not Started

## Summary

Implement state management for quest system with mode transitions between quest states (active, completed, failed, abandoned) and integration with other gameplay modes (battle, trading, exploration).

## Core Features

### Quest States

- **Inactive**: Quest not started
- **Active**: Quest in progress
- **Completed**: Quest successfully finished
- **Failed**: Quest failed
- **Abandoned**: Quest abandoned by player
- **Paused**: Quest temporarily paused

### Quest Mode Transitions

- Inactive → Active (quest accepted)
- Active → Completed (quest finished)
- Active → Failed (quest failed)
- Active → Abandoned (quest abandoned)
- Active → Paused (quest paused)
- Paused → Active (quest resumed)
- Failed → Active (quest retried)

### Integration Modes

- Quest + Battle (combat quests)
- Quest + Trading (trade quests)
- Quest + Exploration (exploration quests)
- Quest + Dialogue (conversation quests)
- Quest + Crafting (crafting quests)

## Design

```typescript
interface QuestStateManager {
  // Quest state management
  getQuestState(questId: string,): Promise<QuestState>;
  setQuestState(questId: string, state: QuestState,): Promise<void>;
  updateQuestState(questId: string, updates: Partial<QuestState>,): Promise<void>;

  // Quest mode transitions
  transitionQuest(questId: string, from: QuestState, to: QuestState,): Promise<TransitionResult>;
  canTransition(questId: string, from: QuestState, to: QuestState,): boolean;
  getAvailableTransitions(questId: string,): QuestTransition[];

  // Quest integration
  startQuestBattle(questId: string, battleId: string,): Promise<void>;
  endQuestBattle(questId: string, battleId: string,): Promise<void>;
  startQuestTrade(questId: string, tradeId: string,): Promise<void>;
  endQuestTrade(questId: string, tradeId: string,): Promise<void>;

  // Quest persistence
  saveQuestState(questId: string,): Promise<void>;
  loadQuestState(questId: string,): Promise<QuestState>;
  clearQuestState(questId: string,): Promise<void>;
}

interface QuestState {
  id: string;
  questId: string;
  status: QuestStatus;
  progress: QuestProgress;
  objectives: QuestObjective[];
  rewards: QuestReward[];
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  abandonedAt?: Date;
  metadata: Record<string, unknown>;
}

type QuestStatus = "inactive" | "active" | "completed" | "failed" | "abandoned" | "paused";

interface QuestProgress {
  current: number;
  total: number;
  percentage: number;
  milestones: QuestMilestone[];
}

interface QuestObjective {
  id: string;
  description: string;
  status: "pending" | "active" | "completed" | "failed";
  progress: number;
  required: boolean;
  dependencies: string[];
}

interface QuestReward {
  id: string;
  type: "experience" | "item" | "currency" | "reputation" | "unlock";
  value: unknown;
  claimed: boolean;
}

interface QuestTransition {
  from: QuestStatus;
  to: QuestStatus;
  conditions: TransitionCondition[];
  effects: TransitionEffect[];
  reversible: boolean;
}

interface TransitionResult {
  success: boolean;
  from: QuestStatus;
  to: QuestStatus;
  duration: number;
  effects: TransitionEffect[];
  errors: string[];
}
```

## Tasks

- [x] Design quest state management architecture
- [x] Implement quest state machine
- [x] Implement quest state transitions
- [ ] Implement quest mode integration (battle, trading, exploration)
- [x] Implement quest state persistence
- [x] Implement quest progress tracking
- [x] Implement quest objective management
- [x] Implement quest reward management
- [x] Implement quest validation
- [x] Implement quest error handling
- [x] Write tests for quest state management

## Files

- `src/rpg/quests/service.ts` — quest service with state management (✅ created)
- `src/rpg/quests/service.test.ts` — tests (✅ created)
- `src/rpg/quests/integration.ts` — quest integration with battle/trading/exploration (TODO)
