<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Battle & Combat UI

**Overview:** (see sections below)


**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** High
**Type:** Feature Epic
**Tags:** battle, combat, ui, frontend

## Summary

Complete battle interface for turn-based combat, including state display, action selection, turn order visualization, and battle log. Required to make the battle system usable by end users.

## Core Features

### Battle State Display

- Health/mana/stamina bars for all participants
- Status effect badges (buffs/debuffs)
- Position display (front/back/flank)
- Environmental effects indicator
- Battle phase indicator (setup/active/paused/completed)

### Turn Order Visualization

- Current turn highlight
- Turn queue display
- Initiative order list
- Turn timer (optional)

### Action Selection Interface

- Action buttons (attack, defend, item, spell, ability, flee, negotiate)
- Target selection (single, area, self)
- Action cost display (mana, stamina, items)
- Cooldown indicators
- Action confirmation dialog

### Battle Log Viewer

- Scrollable battle history
- Filter by action type
- Expandable details
- Export/save battle log

### Skill Check UI

- Dice roll animation
- Result display (success/failure/critical)
- Modifier breakdown
- Narrative result text

## UI Components

### Battle Screen Layout

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

### Action Selection Modal

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

### Dice Roll Animation

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

## Integration Points

### Backend Dependencies

| Backend System    | What It Provides                  | How Used                          |
| ----------------- | --------------------------------- | --------------------------------- |
| Battle Core       | Battle state, turn order, actions | Display state, trigger actions    |
| RPG Mechanics     | Stats, dice rolls, damage calc    | Show modifiers, calculate results |
| Resolution System | Unified dice/action resolution    | Skill checks, attack rolls        |
| Weather System    | Environmental modifiers           | Display environmental effects     |
| Social System     | Persuasion, intimidation          | Negotiate action options          |

### Shared Components

| Component            | Used By               | Notes                             |
| -------------------- | --------------------- | --------------------------------- |
| Health bar widget    | Battle, NSFW, NPC     | Reusable across systems           |
| Status effect badges | Battle, NSFW, Disease | Shared buff/debuff display        |
| Dice roll animation  | Battle, Skill checks  | Reusable for all dice rolls       |
| Action button grid   | Battle, Trading       | Similar action selection patterns |

## Acceptance Criteria

- [ ] Battle state displays all participants with health/mana/stamina bars
- [ ] Status effects shown as badges with tooltips
- [ ] Turn order visualization shows current turn and queue
- [ ] Action selection interface with all action types
- [ ] Target selection for single/area/self actions
- [ ] Action cost and cooldown display
- [ ] Battle log with scrollable history
- [ ] Skill check UI with dice roll animation
- [ ] Environmental effects display
- [ ] Mobile responsive (touch-friendly action buttons)
- [ ] Keyboard shortcuts for common actions
- [ ] Accessibility (ARIA labels, screen reader support)

## Implementation Phases

### Phase 1: Core Battle Display

- Battle state component
- Health/mana/stamina bars
- Status effect badges
- Turn order display

### Phase 2: Action Selection

- Action button grid
- Target selection modal
- Action cost display
- Cooldown indicators

### Phase 3: Battle Log

- Scrollable log component
- Filter by action type
- Expandable details

### Phase 4: Skill Checks

- Dice roll animation
- Result display
- Modifier breakdown

### Phase 5: Polish

- Mobile responsive
- Keyboard shortcuts
- Accessibility
- Animations

## Tasks

| Task                           | Priority | Status         |
| ------------------------------ | -------- | -------------- |
| TASK-battle-screen.md          | P0       | ⬜ Not Started |
| TASK-battle-state-display.md   | P0       | ⬜ Not Started |
| TASK-battle-action-selector.md | P0       | ⬜ Not Started |
| TASK-battle-log.md             | P0       | ⬜ Not Started |
| TASK-skill-check.md            | P0       | ⬜ Not Started |
| TASK-health-bar.md             | P0       | ⬜ Not Started |
| TASK-status-effects.md         | P0       | ⬜ Not Started |
| TASK-battle-alpine.md          | P0       | ⬜ Not Started |

## Files to Create

- `src/frontend/battle/battle-screen.ts` — Main battle page
- `src/frontend/battle/battle-state.ts` — State display component
- `src/frontend/battle/action-selector.ts` — Action selection UI
- `src/frontend/battle/battle-log.ts` — Battle log component
- `src/frontend/battle/skill-check.ts` — Dice roll animation
- `src/frontend/battle/health-bar.ts` — Reusable health bar
- `src/frontend/battle/status-effects.ts` — Status effect badges
- `src/frontend/alpine/battle.ts` — Alpine.js battle logic

## Related Epics

- **Epic Battle & Action Systems** — Backend battle mechanics
- **Epic RPG Mechanics** — Stats, dice, damage calculation
- **Epic Resolution System** — Unified dice resolution
