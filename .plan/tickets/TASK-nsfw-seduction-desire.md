<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Seduction & Desire System

**Epic:** AO NSFW Game Mechanics
**Priority:** High
**Effort:** Large
**Status:** Not Started

## Summary

Implement seduction mechanics with desire profiles (turn-ons, turn-offs, fetishes, hard limits), seduction skills, arousal state tracking, and arousal modifiers from context (location, partner, items, state).

## Core Features

### Desire Profiles

- Turn-ons / turn-offs: traits or actions that modify attraction.
- Fetishes: specific kink tags with mechanical effects (see canonical `FantasyCategory` in `src/db/enums-character/nsfw.ts`).
- Hard limits: never-acceptable boundaries (enforced mechanically).

### Seduction Skills

- Skill categories (flirting, dirty talk, massage, dancing, sexting, etc.): see canonical `SeductionSkillCategory` enum in `src/db/enums-character/nsfw.ts`.
- Skills improve with practice.
- Effectiveness modified by target's desire profile.
- Failure consequences (embarrassment, rejection, intimacy loss).

### Arousal State

- Level on a 0-100 scale with named tiers (`calm`…`climax`): see canonical `ArousalLevel` enum in `src/db/enums-character/nsfw.ts`.
- Buildup rate modified by context; decay rate when not stimulated.
- Effects at each threshold (behavior changes, unlock actions).

### Arousal Modifiers

- Location (public = faster buildup, more risk)
- Partner (new partner, familiar partner)
- Items (items, consumables)
- State (heat, arousal, mood)

## Design

```typescript
interface SeductionManager {
  // Desire profiles
  getDesireProfile(characterId: string,): Promise<DesireProfile>;
  updateDesireProfile(characterId: string, updates: Partial<DesireProfile>,): Promise<void>;

  // Seduction attempts
  attemptSeduction(seducer: string, target: string, action: SeductionAction,): Promise<SeductionResult>;

  // Arousal
  getArousal(characterId: string,): Promise<ArousalState>;
  modifyArousal(characterId: string, delta: number, source: string,): Promise<void>;
  processArousalDecay(characterId: string,): Promise<void>;

  // Skills
  getSeductionSkills(characterId: string,): Promise<SeductionSkill[]>;
  improveSkill(characterId: string, skillId: string, amount: number,): Promise<void>;
  checkSkillSuccess(characterId: string, skillId: string, target: string,): Promise<boolean>;
}

interface SeductionResult {
  success: boolean;
  arousal_change: number;
  intimacy_change: number;
  skill_improvement: number;
  mood_effects: MoodEffect[];
  rejection: boolean;
  rejection_consequences: string[];
}

interface ArousalState {
  character_id: string;
  level: number; // 0-100
  buildup_rate: number;
  decay_rate: number;
  modifiers: ArousalModifier[];
  threshold_effects: ArousalThreshold[];
  last_stimulus: Date;
}

interface ArousalThreshold {
  level: number; // 50, 75, 90, 100
  effects: string[];
  behavior_changes: string[];
  unlock_actions: string[];
}
```

## Tasks

- [ ] Design seduction system architecture
- [ ] Implement desire profiles
- [ ] Implement turn-ons/turn-offs
- [ ] Implement fetishes
- [ ] Implement hard limits (enforced)
- [ ] Implement seduction skills
- [ ] Implement skill improvement
- [ ] Implement arousal state tracking
- [ ] Implement arousal modifiers
- [ ] Implement arousal thresholds
- [ ] Implement seduction success/failure
- [ ] Integrate with intimacy system
- [ ] Integrate with mood system
- [ ] Write tests for seduction system

## Files

- `src/rpg/seduction/manager.ts` — seduction manager
- `src/rpg/seduction/desire.ts` — desire profiles
- `src/rpg/seduction/skills.ts` — seduction skills
- `src/rpg/seduction/arousal.ts` — arousal system
- `src/rpg/seduction/modifiers.ts` — arousal modifiers
- `src/rpg/seduction/types.ts` — type definitions
