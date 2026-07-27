# TASK: Battle Pre-Configured Action Templates

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** Epic Battle & Action Systems
**Tags:** battle, templates, actions, pre-configured, combat, ux
**Effort:** Med

## Summary

Pre-configured, reusable action templates for battle mode. GMs select a template → it populates action sequences, damage formulas, status effects, and targeting rules. Templates act as battle building blocks — a GM picks "Fireball Combo" and the battle engine pre-fills spell chain, area targeting, damage scaling, and visual effects.

## How It Extends Existing Work

Builds on TASK-chat-battle-mode-switch.md (battle mode toggle) and epic-battle-action-systems.md (turn-based mechanics, action types, battle state). Templates are the layer that lets GMs quickly compose complex battle encounters without manually configuring every action.

## Pre-Configured Templates

### Attack Templates

| Template         | Description           | Type   | Target | Damage             | Cooldown | Cost        |
| ---------------- | --------------------- | ------ | ------ | ------------------ | -------- | ----------- |
| `melee_basic`    | Standard melee strike | attack | single | weapon + str       | 0        | stamina: 10 |
| `melee_heavy`    | Slow, powerful hit    | attack | single | weapon + str × 1.5 | 1        | stamina: 25 |
| `melee_flurry`   | Quick multi-hit       | attack | single | weapon × 3 hits    | 0        | stamina: 15 |
| `ranged_basic`   | Standard ranged shot  | attack | single | weapon + dex       | 0        | stamina: 10 |
| `ranged_aoe`     | Arrow rain            | attack | area   | weapon × 0.7       | 2        | stamina: 30 |
| `magic_bolt`     | Basic magic missile   | attack | single | int × 1.2          | 0        | mana: 15    |
| `magic_fireball` | Fire AoE spell        | attack | area   | int × 2.0          | 2        | mana: 40    |
| `magic_heal`     | Restore health        | heal   | single | int × 1.5          | 1        | mana: 25    |

### Defense Templates

| Template        | Description           | Type   | Effect                 | Duration | Cost        |
| --------------- | --------------------- | ------ | ---------------------- | -------- | ----------- |
| `defend_block`  | Block incoming attack | defend | damage × 0.5           | 1 turn   | stamina: 10 |
| `defend_dodge`  | Dodge attack entirely | defend | damage × 0             | 1 turn   | stamina: 15 |
| `defend_parry`  | Counter after block   | defend | damage × 0.3 + counter | 1 turn   | stamina: 20 |
| `defend_shield` | Magic shield absorb   | defend | absorb 50 damage       | 3 turns  | mana: 30    |

### Status Effect Templates

| Template        | Description             | Type   | Target | Effect        | Duration | Cost     |
| --------------- | ----------------------- | ------ | ------ | ------------- | -------- | -------- |
| `buff_strength` | Strengthen ally         | buff   | single | attack +20%   | 3 turns  | mana: 20 |
| `buff_speed`    | haste ally              | buff   | single | speed +30%    | 2 turns  | mana: 15 |
| `debuff_weaken` | Weaken enemy            | debuff | single | attack -20%   | 3 turns  | mana: 20 |
| `debuff_slow`   | Slow enemy              | debuff | single | speed -30%    | 2 turns  | mana: 15 |
| `status_poison` | Poison damage over time | status | single | 5 damage/turn | 4 turns  | mana: 25 |
| `status_burn`   | Burn damage over time   | status | single | 8 damage/turn | 3 turns  | mana: 30 |

### Combo Templates

| Template               | Description       | Steps                                    | Total Damage | Total Cost  |
| ---------------------- | ----------------- | ---------------------------------------- | ------------ | ----------- |
| `combo_fire_chain`     | Chain fire spells | magic_bolt → magic_fireball → magic_bolt | int × 5.2    | mana: 70    |
| `combo_melee_cleave`   | Melee AoE combo   | melee_flurry → melee_heavy               | weapon × 4.5 | stamina: 40 |
| `combo_debuff_burst`   | Debuff + damage   | debuff_weaken → magic_fireball           | int × 3.2    | mana: 60    |
| `combo_defend_counter` | Block + counter   | defend_parry → melee_heavy               | weapon × 1.8 | stamina: 40 |
| `combo_heal_burst`     | Multi-target heal | magic_heal → magic_heal → buff_strength  | int × 4.5    | mana: 70    |

### Flee Templates

| Template        | Description       | Condition     | Success Rate    | Penalty   |
| --------------- | ----------------- | ------------- | --------------- | --------- |
| `flee_basic`    | Standard retreat  | speed check   | 60% + speed mod | None      |
| `flee_smoke`    | Smoke bomb escape | item required | 90%             | Lose item |
| `flee_distract` | Distract and run  | int check     | 70% + int mod   | -1 turn   |

## Design

```typescript
interface BattleActionTemplate {
  id: string;
  name: string;
  description: string;
  category: "attack" | "defense" | "status" | "combo" | "flee" | "negotiate";
  type: BattleActionType;
  target: "self" | "single" | "area" | "all_enemies" | "all_allies";
  damage?: DamageFormula;
  healing?: HealingFormula;
  effects: StatusEffectTemplate[];
  cost: ActionCost;
  cooldown: number;
  requirements: ActionRequirement[];
  animation?: string;
  sound?: string;
}

interface DamageFormula {
  base: number;
  scaling: "str" | "dex" | "int" | "weapon" | "custom";
  multiplier: number;
  variance: number; // ±random variance
  critChance?: number;
  critMultiplier?: number;
}

interface HealingFormula {
  base: number;
  scaling: "int" | "wis" | "custom";
  multiplier: number;
}

interface StatusEffectTemplate {
  type: "buff" | "debuff" | "status";
  effect: string; // 'strength', 'speed', 'poison', etc.
  value: number; // percentage or flat
  duration: number; // turns
  stacking: boolean;
  dispellable: boolean;
}

interface ActionRequirement {
  type: "level" | "stat" | "item" | "class" | "cooldown";
  value: string | number;
}

interface BattleComboTemplate {
  id: string;
  name: string;
  description: string;
  steps: BattleComboStep[];
  totalDamage: DamageFormula;
  totalCost: ActionCost;
  unlockCondition?: ActionRequirement;
}

interface BattleComboStep {
  actionTemplateId: string;
  condition?: string; // JS expression for conditional step
  delay?: number; // ms for animation timing
}
```

## Implementation

### Phase 1: Template Data

- [ ] Create `src/battle/templates/action-templates.ts` — pre-defined action templates
- [ ] Create `src/battle/templates/combo-templates.ts` — pre-defined combo templates
- [ ] Create `src/battle/templates/flee-templates.ts` — pre-defined flee templates
- [ ] Template registry — lookup by ID, list all, filter by category

### Phase 2: Template Application

- [ ] Apply action template to battle action (merge template → action config)
- [ ] Apply combo template to battle turn (execute step sequence)
- [ ] Template override — GM can override individual template fields
- [ ] Template scaling — auto-scale damage/healing to character stats

### Phase 3: GM UI

- [ ] Template picker modal — browse/search templates by category
- [ ] Template preview — show damage/cost/effects before applying
- [ ] Quick-apply button in battle toolbar
- [ ] Template favorites/recent list
- [ ] Custom template creation (extends base templates)

### Phase 4: Integration

- [ ] Wire templates to battle action selection UI
- [ ] Wire templates to battle turn resolution
- [ ] Wire templates to battle log generation
- [ ] Template auto-suggest based on character class/stats

## Files to Create

- `src/battle/templates/action-templates.ts`
- `src/battle/templates/combo-templates.ts`
- `src/battle/templates/flee-templates.ts`
- `src/battle/templates/index.ts`

## Files to Modify

- `src/battle/actions.ts` — consume action templates
- `src/battle/modes.ts` — consume combo templates for turn execution
- `src/frontend/battle/action-menu.ts` — consume templates for action display
- `src/components/battle/battle-toolbar.html` — add template picker UI

## Acceptance Criteria

- [ ] Action templates apply damage formulas, costs, and effects to battle actions
- [ ] Combo templates execute multi-step action sequences
- [ ] Flee templates apply success rates and penalties
- [ ] GM can browse and select templates from a picker UI
- [ ] Templates can be overridden per-encounter without modifying the template
- [ ] Template scaling auto-adjusts damage/healing to character stats
- [ ] Battle log shows template names in action descriptions
- [ ] No performance regression in battle mode rendering

## Risk

Low — templates are pure configuration overlays on existing battle mechanics. No schema changes. Main risk is damage formula balancing across different character builds.

## Related

- `TASK-chat-battle-mode-switch.md` — base battle mode toggle
- `TASK-battle-encounter-template-system.md` — encounter templates use action templates
- `TASK-enemies-monsters-systems.md` — enemies use action templates
- `TASK-battle-arena-spectator.md` — spectating uses template-driven battles
- `epic-battle-action-systems.md` — core battle mechanics
