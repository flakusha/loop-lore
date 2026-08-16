<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Battle State Display

**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-battle-ui

## Summary

Implement battle state display component showing health/mana/stamina bars, status effects, position, and environmental effects for all battle participants.

## Acceptance Criteria

- [ ] Health/mana/stamina bars for all participants
- [ ] Status effect badges with tooltips
- [ ] Position display (front/back/flank)
- [ ] Environmental effects indicator
- [ ] Battle phase indicator
- [ ] Current turn highlight
- [ ] Mobile responsive

## Implementation Details

### Battle State Component

```typescript
// src/frontend/battle/battle-state.ts
export interface BattleParticipant {
  id: string;
  name: string;
  type: "player" | "npc" | "monster";
  team: "ally" | "enemy";
  stats: {
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
    stamina: number;
    maxStamina: number;
  };
  statusEffects: StatusEffect[];
  position: {
    zone: "front" | "back" | "flank" | "center";
    facing: "north" | "south" | "east" | "west";
  };
  isCurrentTurn: boolean;
}

export interface StatusEffect {
  id: string;
  name: string;
  type: "buff" | "debuff";
  icon: string;
  duration: number;
  description: string;
}

export interface BattleEnvironment {
  weather: string;
  timeOfDay: string;
  terrain: string;
  effects: string[];
}
```

### Health Bar Component

```html
<!-- Health bar with status effects -->
<div class="battle-participant" data-team="ally" data-current-turn="true">
  <div class="participant-name">You</div>
  <div class="status-effects">
    <span class="status-badge buff" title="Haste: +20% Speed">⚡</span>
    <span class="status-badge debuff" title="Poison: -5 HP/turn">🤢</span>
  </div>
  <div class="stat-bars">
    <div class="stat-bar health">
      <span class="stat-label">HP</span>
      <div class="bar-track">
        <div class="bar-fill" style="width: 80%"></div>
      </div>
      <span class="stat-value">80/100</span>
    </div>
    <div class="stat-bar mana">
      <span class="stat-label">MP</span>
      <div class="bar-track">
        <div class="bar-fill" style="width: 60%"></div>
      </div>
      <span class="stat-value">30/50</span>
    </div>
    <div class="stat-bar stamina">
      <span class="stat-label">SP</span>
      <div class="bar-track">
        <div class="bar-fill" style="width: 90%"></div>
      </div>
      <span class="stat-value">45/50</span>
    </div>
  </div>
  <div class="position-indicator">
    <span class="zone">Front</span>
    <span class="facing">→</span>
  </div>
</div>
```

### CSS Styles

```css
/* Battle participant card */
.battle-participant {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 1rem;
  transition: all 0.2s ease;
}

.battle-participant[data-current-turn="true"] {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary);
}

.battle-participant[data-team="enemy"] {
  border-color: var(--accent-red);
}

/* Stat bars */
.stat-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.stat-label {
  width: 2rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.bar-track {
  flex: 1;
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.stat-bar.health .bar-fill {
  background: var(--accent-green);
}

.stat-bar.mana .bar-fill {
  background: var(--accent-blue);
}

.stat-bar.stamina .bar-fill {
  background: var(--accent-yellow);
}

.stat-value {
  width: 4rem;
  font-size: 0.75rem;
  text-align: right;
}

/* Status effect badges */
.status-effects {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.status-badge {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: help;
}

.status-badge.buff {
  background: rgba(76, 175, 80, 0.2);
}

.status-badge.debuff {
  background: rgba(244, 67, 54, 0.2);
}

/* Position indicator */
.position-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
```

## Files to Create

- `src/frontend/battle/battle-state.ts`
- `src/frontend/battle/battle-state.css`
- `src/frontend/alpine/battle-state.ts`

## Related Tasks

- TASK-battle-action-selector.md
- TASK-battle-turn-order.md
- TASK-battle-log.md
