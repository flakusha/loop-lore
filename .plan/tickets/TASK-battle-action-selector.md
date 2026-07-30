# TASK: Battle Action Selector

**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-battle-ui

## Summary

Implement battle action selection interface with action buttons, target selection, cost display, and cooldown indicators.

## Acceptance Criteria

- [ ] Action buttons (attack, defend, item, spell, ability, flee, negotiate)
- [ ] Target selection (single, area, self)
- [ ] Action cost display (mana, stamina, items)
- [ ] Cooldown indicators
- [ ] Action confirmation dialog
- [ ] Mobile responsive (large touch targets)

## Implementation Details

### Action Selector Component

```typescript
// src/frontend/battle/action-selector.ts
export interface BattleAction {
  id: string;
  name: string;
  icon: string;
  type: "attack" | "defend" | "item" | "spell" | "ability" | "flee" | "negotiate";
  cost: {
    mana?: number;
    stamina?: number;
    items?: string[];
    actionPoints?: number;
  };
  target: "self" | "single" | "area" | "all_enemies" | "all_allies";
  cooldown: number;
  currentCooldown: number;
  available: boolean;
  description: string;
}

export interface TargetSelection {
  targetType: "self" | "single" | "area" | "all_enemies" | "all_allies";
  selectedTargets: string[];
  validTargets: string[];
}
```

### Action Button Grid

```html
<!-- Action selection interface -->
<div class="action-selector">
  <div class="action-grid">
    <button class="action-btn" data-action="attack" data-available="true">
      <span class="action-icon">⚔️</span>
      <span class="action-name">Attack</span>
      <span class="action-cost">1 AP</span>
    </button>
    <button class="action-btn" data-action="defend" data-available="true">
      <span class="action-icon">🛡️</span>
      <span class="action-name">Defend</span>
      <span class="action-cost">1 AP</span>
    </button>
    <button class="action-btn" data-action="item" data-available="true">
      <span class="action-icon">🧪</span>
      <span class="action-name">Item</span>
      <span class="action-cost">1 AP</span>
    </button>
    <button class="action-btn" data-action="spell" data-available="true">
      <span class="action-icon">✨</span>
      <span class="action-name">Spell</span>
      <span class="action-cost">5 MP</span>
    </button>
    <button class="action-btn" data-action="ability" data-available="false">
      <span class="action-icon">💫</span>
      <span class="action-name">Ability</span>
      <span class="action-cost">10 SP</span>
      <span class="cooldown">CD: 2</span>
    </button>
    <button class="action-btn" data-action="flee" data-available="true">
      <span class="action-icon">💨</span>
      <span class="action-name">Flee</span>
      <span class="action-cost">1 AP</span>
    </button>
    <button class="action-btn" data-action="negotiate" data-available="true">
      <span class="action-icon">💬</span>
      <span class="action-name">Negotiate</span>
      <span class="action-cost">1 AP</span>
    </button>
  </div>

  <!-- Target selection -->
  <div class="target-selector" data-target-type="single">
    <div class="target-list">
      <button class="target-btn" data-target="enemy-1">
        <span class="target-name">Goblin 1</span>
        <span class="target-hp">HP: 80%</span>
      </button>
      <button class="target-btn" data-target="enemy-2">
        <span class="target-name">Goblin 2</span>
        <span class="target-hp">HP: 60%</span>
      </button>
      <button class="target-btn" data-target="enemy-3">
        <span class="target-name">Goblin 3</span>
        <span class="target-hp">HP: 40%</span>
      </button>
    </div>
  </div>

  <!-- Action details -->
  <div class="action-details">
    <div class="action-info">
      <h3>Attack</h3>
      <p>Deal 1d8 + STR modifier damage to a single target.</p>
      <div class="action-stats">
        <span>Damage: 1d8 + 3</span>
        <span>Crit: 5%</span>
        <span>Accuracy: 85%</span>
      </div>
    </div>
    <div class="action-buttons">
      <button class="btn-secondary" data-action="cancel">Cancel</button>
      <button class="btn-primary" data-action="confirm" disabled>Confirm</button>
    </div>
  </div>
</div>
```

### CSS Styles

```css
/* Action selector layout */
.action-selector {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

/* Action button grid */
.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 0.5rem;
}

.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  background: var(--bg-tertiary);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 80px;
}

.action-btn:hover:not([data-available="false"]) {
  border-color: var(--accent-primary);
  background: var(--bg-quaternary);
}

.action-btn[data-available="false"] {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.selected {
  border-color: var(--accent-primary);
  background: rgba(245, 151, 232, 0.1);
}

.action-icon {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}

.action-name {
  font-size: 0.875rem;
  font-weight: 600;
}

.action-cost {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.cooldown {
  font-size: 0.75rem;
  color: var(--accent-red);
}

/* Target selector */
.target-selector {
  border-top: 1px solid var(--border-default);
  padding-top: 1rem;
}

.target-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.target-btn {
  display: flex;
  flex-direction: column;
  padding: 0.75rem 1rem;
  background: var(--bg-tertiary);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 120px;
}

.target-btn:hover {
  border-color: var(--accent-primary);
}

.target-btn.selected {
  border-color: var(--accent-primary);
  background: rgba(245, 151, 232, 0.1);
}

.target-name {
  font-weight: 600;
}

.target-hp {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

/* Action details */
.action-details {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-top: 1px solid var(--border-default);
  padding-top: 1rem;
}

.action-info h3 {
  margin: 0 0 0.5rem 0;
}

.action-info p {
  margin: 0 0 0.5rem 0;
  color: var(--text-secondary);
}

.action-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .action-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .action-btn {
    min-height: 100px;
    padding: 1.5rem;
  }

  .target-list {
    flex-direction: column;
  }

  .target-btn {
    width: 100%;
  }

  .action-details {
    flex-direction: column;
    gap: 1rem;
  }

  .action-buttons {
    width: 100%;
  }

  .action-buttons button {
    flex: 1;
  }
}
```

## Files to Create

- `src/frontend/battle/action-selector.ts`
- `src/frontend/battle/action-selector.css`
- `src/frontend/alpine/battle-actions.ts`

## Related Tasks

- TASK-battle-state-display.md
- TASK-battle-turn-order.md
- TASK-battle-log.md
