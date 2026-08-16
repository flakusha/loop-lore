<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Battle Encounter Template System

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** Epic Battle & Action Systems
**Tags:** battle, templates, encounters, system, engine, gm-tools
**Effort:** Med

## Summary

Template engine for battle encounters — create, store, compose, and apply custom encounter templates. Extends TASK-battle-template-actions.md (pre-defined action templates) with a full encounter template system: enemy composition, difficulty scaling, reward tables, terrain effects, and scripted events. Templates are stored per-world and trigger on location, time, or GM command.

## How It Extends Existing Work

TASK-battle-template-actions.md provides pre-defined action templates. This ticket adds the engine that composes full encounters: enemy lineups, difficulty scaling, terrain, rewards, and scripted events. GMs build encounter templates that reference enemy templates, action templates, and world state.

## Design

### Encounter Template Engine

```typescript
interface BattleEncounterTemplate {
  id: string;
  name: string;
  description: string;
  worldId: string; // scope to world
  category: "random" | "scripted" | "boss" | "event" | "custom";
  difficulty: "trivial" | "easy" | "medium" | "hard" | "deadly";
  version: number;
  enemies: EncounterEnemy[];
  terrain: EncounterTerrain;
  rewards: EncounterReward[];
  events: EncounterEvent[];
  triggers: EncounterTrigger[];
  scaling: EncounterScaling;
  created: Date;
  modified: Date;
}

interface EncounterEnemy {
  enemyTemplateId: string; // references TASK-enemies-monsters-systems
  count: number | string; // number or range like "2-4"
  levelScaling: "fixed" | "party_level" | "location_level";
  position?: "front" | "back" | "flank";
  ai?: "aggressive" | "defensive" | "tactical" | "random";
  lootModifier?: number; // 1.0 = normal, 0.5 = half, 2.0 = double
}

interface EncounterTerrain {
  type: "open" | "forest" | "dungeon" | "urban" | "underwater" | "aerial";
  effects: TerrainEffect[];
  hazards: TerrainHazard[];
  cover: number; // 0-100, chance to avoid ranged attacks
  movement: number; // 0-100, movement speed modifier
}

interface TerrainEffect {
  type: "damage" | "heal" | "buff" | "debuff";
  target: "all" | "allies" | "enemies";
  value: number;
  chance: number; // 0-100
  description: string;
}

interface TerrainHazard {
  type: "trap" | "environmental" | "puzzle";
  damage: number;
  triggerChance: number;
  description: string;
  disarmedBy?: string; // skill check type
}

interface EncounterReward {
  type: "xp" | "gold" | "item" | "reputation" | "unlock";
  value: number | string; // number or range like "100-200"
  chance: number; // 0-100
  itemTemplateId?: string; // for item rewards
  scaling?: number; // scales with difficulty
}

interface EncounterEvent {
  trigger: "on_start" | "on_turn" | "on_enemy_defeated" | "on_hp_low" | "on_victory";
  type: "narrative" | "spawn_enemy" | "change_terrain" | "apply_effect" | "gm_choice";
  content: string | object;
  condition?: string; // JS expression
}

interface EncounterTrigger {
  type: "location" | "time" | "random" | "item" | "quest" | "gm_command";
  value: string | number;
  chance: number; // 0-100
  cooldown: number; // turns before can trigger again
}

interface EncounterScaling {
  partyLevelRange: [number, number,];
  enemyScaling: "linear" | "exponential" | "custom";
  rewardScaling: "linear" | "logarithmic" | "custom";
  maxEnemies: number;
}
```

### Pre-Defined Encounter Templates

| Template          | Difficulty | Enemies              | Terrain | Trigger           |
| ----------------- | ---------- | -------------------- | ------- | ----------------- |
| `goblin_ambush`   | Easy       | 2-4 goblins          | forest  | location (forest) |
| `skeleton_patrol` | Medium     | 3-5 skeletons        | dungeon | random (15%)      |
| `troll_bridge`    | Hard       | 1 troll              | open    | location (bridge) |
| `dragon_lair`     | Deadly     | 1 ancient dragon     | dungeon | quest             |
| `bandit_road`     | Easy       | 2-4 bandits          | open    | random (20%)      |
| `undead_horde`    | Hard       | 5-8 zombies          | dungeon | time (night)      |
| `merchant_guard`  | Medium     | 2 guards + 1 captain | urban   | gm_command        |
| `elemental_storm` | Hard       | 2 elementals         | open    | random (10%)      |
| `boss_lich`       | Deadly     | 1 lich + 2 wraiths   | dungeon | quest             |
| `tutorial_fight`  | Trivial    | 1 training dummy     | open    | gm_command        |

### Difficulty Scaling

```typescript
interface DifficultyConfig {
  trivial: { hpMult: 0.5; dmgMult: 0.5; xpMult: 0.25 };
  easy: { hpMult: 0.75; dmgMult: 0.75; xpMult: 0.5 };
  medium: { hpMult: 1.0; dmgMult: 1.0; xpMult: 1.0 };
  hard: { hpMult: 1.5; dmgMult: 1.5; xpMult: 2.0 };
  deadly: { hpMult: 2.0; dmgMult: 2.0; xpMult: 4.0 };
}
```

## Implementation

### Phase 1: Template Storage

- [ ] Create `src/battle/templates/encounter-engine.ts` — core engine
- [ ] Template storage: `localStorage` per-world (no DB schema needed)
- [ ] Template CRUD: create, read, update, delete
- [ ] Template import/export as JSON
- [ ] Template versioning (increment on save)

### Phase 2: Enemy Composition

- [ ] Enemy template references (lookup from enemy config files)
- [ ] Count ranges: `"2-4"` → random roll at encounter start
- [ ] Level scaling: party_level, location_level, fixed
- [ ] AI behavior assignment per enemy type
- [ ] Position assignment (front/back/flank)

### Phase 3: Terrain & Hazards

- [ ] Terrain type effects (damage, heal, buff, debuff per turn)
- [ ] Hazard triggers (trap, environmental, puzzle)
- [ ] Cover and movement modifiers
- [ ] Terrain change events (mid-battle terrain shift)

### Phase 4: Rewards & Events

- [ ] Reward table: xp, gold, item, reputation, unlock
- [ ] Chance-based rewards (roll per reward entry)
- [ ] Difficulty scaling for rewards
- [ ] Encounter events: narrative, spawn, terrain change, GM choice
- [ ] Event triggers: on_start, on_turn, on_defeated, on_hp_low, on_victory

### Phase 5: Trigger System

- [ ] Location triggers: encounter fires when entering location
- [ ] Random triggers: chance-based per turn in location
- [ ] Time triggers: time-of-day, day-of-week
- [ ] Quest triggers: quest state check
- [ ] GM command triggers: manual activation
- [ ] Cooldown: prevent duplicate encounters

### Phase 6: GM UI

- [ ] Encounter template builder — enemy picker, terrain config, reward table
- [ ] Template gallery — browse by difficulty, category
- [ ] Template preview — show enemy lineup, terrain effects, rewards
- [ ] Quick-apply button in battle toolbar
- [ ] Template duplication (fork existing template)
- [ ] Template testing — simulate encounter outcome

## Files to Create

- `src/battle/templates/encounter-engine.ts`
- `src/battle/templates/encounter-storage.ts`
- `src/battle/templates/encounter-builder.ts`
- `src/battle/templates/encounter-gallery.ts`
- `src/battle/templates/difficulty-scaling.ts`
- `src/battle/templates/terrain-effects.ts`
- `src/battle/templates/reward-tables.ts`
- `src/battle/templates/trigger-system.ts`

## Files to Modify

- `src/battle/modes.ts` — consume encounter templates for battle setup
- `src/battle/actions.ts` — consume action templates from encounter
- `src/routes/battle.ts` — encounter template API endpoints
- `src/frontend/battle/battle-toolbar.html` — add encounter template picker
- `src/battle/templates/index.ts` — export encounter engine

## Acceptance Criteria

- [ ] GM can create custom encounter templates with enemy lineups
- [ ] Difficulty scaling auto-adjusts enemy stats and rewards
- [ ] Terrain effects apply per-turn during battle
- [ ] Hazard triggers fire on appropriate turns
- [ ] Reward tables generate loot on victory
- [ ] Encounter events fire at correct triggers (on_start, on_turn, etc.)
- [ ] Location triggers fire when entering location
- [ ] Random triggers fire with configured chance
- [ ] GM can browse and select templates from a picker UI
- [ ] Templates can be exported/imported as JSON
- [ ] Template testing simulates encounter outcome
- [ ] No performance regression in battle mode rendering

## Risk

Med — encounter template system is significant but stays within battle module (no DB schema). Main risk is difficulty scaling balance across different party compositions. Trigger system needs careful cooldown management to avoid encounter spam.

## Related

- `TASK-battle-template-actions.md` — action templates used within encounters
- `TASK-enemies-monsters-systems.md` — enemy templates referenced by encounter templates
- `TASK-chat-battle-mode-switch.md` — battle mode toggle
- `TASK-random-encounters-events.md` — random encounter tables reference encounter templates
- `epic-battle-action-systems.md` — core battle mechanics
