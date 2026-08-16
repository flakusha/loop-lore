<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Intimacy System

**Epic:** AO NSFW Game Mechanics
**Priority:** High
**Effort:** Large
**Status:** Not Started

## Summary

Implement intimacy level system between characters with progression thresholds, threshold events that unlock new interaction types, and integration with relationship/trust systems.

## Core Features

### Intimacy Levels

- Strangers (0) → Acquaintances (10) → Friends (25) → Close Friends (40) → Romantic Interest (55) → Dating (70) → Intimate (85) → Soulbonded (100)
- Each level unlocks new interaction types
- Levels can decrease through neglect, betrayal, or negative actions

### Intimacy Actions

- Verbal actions (compliments, dirty talk, confessing feelings)
- Physical actions (touching, kissing, holding hands, more intimate)
- Gift actions (giving items, crafting for partner)
- Service actions (helping, protecting, providing)
- Intimate actions (adult interactions, vulnerability)

### Threshold Events

- New interaction types unlock at each level
- NPC reactions change at thresholds
- Gameplay effects (discounts, quests, dialogue options)
- Memory creation at significant thresholds

### Integration

- Connects to relationship system (existing)
- Connects to trust system (existing)
- Connects to mood system (TASK-nsfw-mood-emotional)
- Connects to reputation system (TASK-nsfw-reputation-social)

## Design

```typescript
interface IntimacyManager {
  // Get/set intimacy between characters
  getIntimacy(charA: string, charB: string,): Promise<IntimacyRecord>;
  setIntimacy(charA: string, charB: string, value: number,): Promise<void>;
  modifyIntimacy(charA: string, charB: string, delta: number, reason: string,): Promise<void>;

  // Process intimacy action
  processAction(action: IntimacyAction, actor: string, target: string,): Promise<IntimacyResult>;

  // Check thresholds
  checkThresholds(charA: string, charB: string,): Promise<ThresholdEvent[]>;
  getUnlockedInteractions(charA: string, charB: string,): Promise<string[]>;

  // Intimacy decay
  processDecay(charA: string, charB: string, daysSinceInteraction: number,): Promise<void>;
}

interface IntimacyRecord {
  characterA: string;
  characterB: string;
  level: number; // 0-100
  tier: IntimacyTier;
  history: IntimacyEvent[];
  unlocked_interactions: string[];
  last_interaction: Date;
  decay_paused: boolean;
}

type IntimacyTier =
  | "strangers"
  | "acquaintances"
  | "friends"
  | "close_friends"
  | "romantic_interest"
  | "dating"
  | "intimate"
  | "soulbonded";

interface IntimacyResult {
  success: boolean;
  intimacy_change: number;
  new_level: number;
  tier_changed: boolean;
  threshold_events: ThresholdEvent[];
  effects: IntimacyEffect[];
}

interface ThresholdEvent {
  level: number;
  tier: IntimacyTier;
  unlock: string;
  npc_reaction: string;
  gameplay_effects: string[];
  memory_description: string;
}
```

## Tasks

- [ ] Design intimacy system architecture
- [ ] Implement intimacy levels and tiers
- [ ] Implement intimacy actions
- [ ] Implement threshold events
- [ ] Implement intimacy decay
- [ ] Implement intimacy history tracking
- [ ] Integrate with relationship system
- [ ] Integrate with trust system
- [ ] Integrate with NPC AI (reactions)
- [ ] Implement intimacy memory creation
- [ ] Write tests for intimacy system

## Files

- `src/rpg/intimacy/manager.ts` — intimacy manager
- `src/rpg/intimacy/levels.ts` — level definitions
- `src/rpg/intimacy/actions.ts` — intimacy actions
- `src/rpg/intimacy/thresholds.ts` — threshold events
- `src/rpg/intimacy/decay.ts` — intimacy decay
- `src/rpg/intimacy/types.ts` — type definitions
