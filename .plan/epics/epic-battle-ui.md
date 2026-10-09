<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Battle & Combat UI

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Partially shipped — chat battle panel with roster HP, attack/heal/end action bar, and keyboard nav is live (verified 2026-10-09); battle log, status-effect badges, turn-order visualization, and skill-check UI remain open.
**Priority:** P0 — Critical
**Effort:** High
**Type:** Feature Epic
**Tags:** battle, combat, ui, frontend

## Summary

Complete battle interface for turn-based combat, including state display, action selection, turn order visualization, and battle log. Required to make the battle system usable by end users.

## Implemented (verified 2026-10-09)

- **Modules:** `src/frontend/battle/panel.ts` (VN-style overlay panel: mount/destroy/render, keyboard focus cycle over combatants + actions), `src/frontend/battle/commands.ts` (attack/heal/end action set + slash-command mapping), `src/frontend/battle/render.ts` (header/roster/actions DOM builders with HP-percentage display); `src/frontend/alpine/chat-battle.ts` + `src/frontend/alpine/chat-actions/battle.ts` (chat-side dispatch of `/attack`, `/heal`, `/battle` commands)
- **Shipped:** battle screen embedded in chat, combatant roster with HP display, single-target selection via focus cycle, keyboard shortcuts (arrows/Enter/Space), dispatch into the backend battle routes
- **Not shipped:** item-use/social/spell/flee buttons (action bar is attack/heal/end only — `src/frontend/battle/commands.ts:38-41`), battle log component, status-effect badges, dedicated health-bar/turn-order widget, skill-check dice animation, dynamic backgrounds

## Current State

| Surface | Status | Where |
| --- | --- | --- |
| Battle panel (roster + action bar) | Shipped | `src/frontend/battle/panel.ts`, `src/frontend/battle/render.ts` |
| Chat battle dispatch (`/attack`, `/heal`, `/battle`) | Shipped | `src/frontend/alpine/chat-battle.ts`, `src/frontend/alpine/chat-actions/battle.ts` |
| Action bar breadth (attack/heal/end only) | Partial | `src/frontend/battle/commands.ts:38-41` |
| Health display (HP only; no mana/stamina widget) | Partial | `hpPercent` + roster in `src/frontend/battle/render.ts` |
| Turn order visualization | Not Started | — |
| Status effect badges | Not Started | — |
| Battle log viewer | Not Started | — |
| Skill check UI (dice animation) | Not Started | — |
| Dynamic backgrounds | Not Started | — (see `./epic-battle-action-systems.md`) |

## Unticketed Gaps

The backend social actions and combat item-use routes already ship (`src/routes/battle/social.ts`, `src/routes/battle/equipment.ts`), but the shipped action bar cannot reach them — adding item-use/social/flee buttons to `src/frontend/battle/commands.ts` is unticketed (see `./epic-battle-integration-gaps.md`). No battle-scoped status-effect badge or reusable health-bar component exists under `src/frontend/` — the only status-effect surface there is character-condition state in `src/frontend/alpine/rpg-stats.ts` (`statusEffects`), despite the reuse expectations in the component table below.

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
- [x] Keyboard shortcuts for common actions (`src/frontend/battle/panel.ts` arrow/Enter/Space focus cycle)
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

## Linked Tasks

- `TASK-battle-screen.md` (open)
- `TASK-battle-alpine.md` (open)
- `TASK-battle-state-display.md` (Not Started)
- `TASK-battle-action-selector.md` (Not Started)
- `TASK-battle-log.md` (Not Started)
- `TASK-skill-check.md` (Not Started)
- `TASK-health-bar.md` (Not Started)
- `TASK-status-effects.md` (Not Started)

## Files

Implemented (verified 2026-10-09):
- `src/frontend/battle/panel.ts` — battle panel mount/state/keyboard
- `src/frontend/battle/commands.ts` — action set + slash-command mapping
- `src/frontend/battle/render.ts` — roster/actions DOM builders
- `src/frontend/alpine/chat-battle.ts` — chat battle mode glue
- `src/frontend/alpine/chat-actions/battle.ts` — `/attack`, `/heal`, `/battle` dispatch

Planned (do not exist yet):
- `src/frontend/battle/battle-screen.ts` — main battle page
- `src/frontend/battle/battle-state.ts` — state display component
- `src/frontend/battle/action-selector.ts` — action selection UI
- `src/frontend/battle/battle-log.ts` — battle log component
- `src/frontend/battle/skill-check.ts` — dice roll animation
- `src/frontend/battle/health-bar.ts` — reusable health bar
- `src/frontend/battle/status-effects.ts` — status effect badges
- `src/frontend/alpine/battle.ts` — standalone Alpine battle logic (chat-battle.ts covers the chat surface)

## Related Epics

- `epic-battle-action-systems.md` — backend battle mechanics this panel drives
- `epic-battle-integration-gaps.md` — social/item backends not yet exposed on the action bar
- `epic-rpg-mechanics.md` — stats, dice, damage calculation
- `epic-resolution-system.md` — unified dice resolution for skill-check UI
