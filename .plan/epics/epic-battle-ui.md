<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Battle & Combat UI

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Partially shipped — chat battle panel with roster HP, keyboard nav, and a full action bar (attack/heal/end, item-use menu, social verbs incl. negotiate) is live, plus a reusable health-bar widget and an acting-first turn-order strip (verified 2026-10-23). Remaining open: battle log, status-effect badges, skill-check UI. A flee action stays unwired by design: no backend verb or route exists for it.
**Priority:** P0 — Critical
**Effort:** High
**Type:** Feature Epic
**Tags:** battle, combat, ui, frontend

## Summary

Complete battle interface for turn-based combat, including state display, action selection, turn order visualization, and battle log. Required to make the battle system usable by end users.

## Implemented (verified 2026-10-23)

- **Modules:** `src/frontend/battle/panel.ts` (VN-style overlay panel: mount/destroy/render, keyboard focus cycle over combatants + actions + items), `src/frontend/battle/commands.ts` (attack/heal/end + item toggle + social-* verb action set + slash-command mapping), `src/frontend/battle/render.ts` (header/roster/actions DOM builders), `src/frontend/battle/health-bar.ts` (reusable HP progressbar widget), `src/frontend/battle/turn-order.ts` (acting-first initiative queue strip); `src/frontend/alpine/chat-battle.ts` + `src/frontend/alpine/chat-actions/battle.ts` (chat-side dispatch of `/attack`, `/heal`, `/battle` commands)
- **Shipped:** battle screen embedded in chat, combatant roster with HP display via the reusable health-bar widget, single-target selection via focus cycle, keyboard shortcuts (arrows/Enter/Space), dispatch into the backend battle routes, turn-order visualization (current turn + upcoming queue, derived from the delivered turnIndex/initiative roster), item-use menu (`/battle use`) and social verbs incl. negotiate (`/battle social`)
- **Not shipped:** flee button (no backend verb or route — `/battle social` rejects `flee`; no flee endpoint), battle log component, status-effect badges, skill-check dice animation, dynamic backgrounds

## Current State

| Surface | Status | Where |
| --- | --- | --- |
| Battle panel (roster + action bar) | Shipped | `src/frontend/battle/panel.ts`, `src/frontend/battle/render.ts` |
| Chat battle dispatch (`/attack`, `/heal`, `/battle`) | Shipped | `src/frontend/alpine/chat-battle.ts`, `src/frontend/alpine/chat-actions/battle.ts` |
| Action bar breadth (attack/heal/end, item-use, social verbs) | Shipped | `src/frontend/battle/commands.ts`, `src/frontend/battle/render.ts` (flee absent — no backend verb/route) |
| Health display (HP progressbar widget; no mana/stamina data) | Shipped (HP) | `src/frontend/battle/health-bar.ts` + roster in `src/frontend/battle/render.ts` |
| Turn order visualization | Shipped | `src/frontend/battle/turn-order.ts` (current turn + queue from delivered turnIndex/initiative) |
| Status effect badges | Not Started | — (client payload carries no conditions: `serializeBattle` drops `Combatant.conditions`) |
| Battle log viewer | Not Started | — (server keeps `battle.log` but never serializes it into the panel payload) |
| Skill check UI (dice animation) | Not Started | — |
| Dynamic backgrounds | Not Started | — (see `./epic-battle-action-systems.md`) |

## Unticketed Gaps (resolved / re-scoped 2026-10-23)

The earlier gap here — backend social and combat item-use routes unreachable from the UI — is closed: the shipped action bar reaches item use (`/battle use` menu) and the social verbs incl. negotiate (`/battle social`) through the chat command path, ticketed and shipped (verified 2026-10-23). Remaining backend-backed display gaps: the battle state the panel receives carries no conditions (`serializeBattle` drops `Combatant.conditions`) and no history (`battle.log` stays server-side), so status-effect badges and a battle log need payload delivery work before they can be built — they must not be faked client-side. A flee action has no backend at all (no verb in `/battle social`, no flee endpoint). The reusable health-bar widget now exists (`src/frontend/battle/health-bar.ts`); status-effect badges under `src/frontend/` still do not — the only status-effect surface remains character-condition state in `src/frontend/alpine/rpg-stats.ts` (`statusEffects`).

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

- [x] Battle state displays all participants with health bars (HP only — mana/stamina have no data source yet; `src/frontend/battle/health-bar.ts`, verified 2026-10-23)
- [ ] Status effects shown as badges with tooltips
- [x] Turn order visualization shows current turn and queue (`src/frontend/battle/turn-order.ts`, verified 2026-10-23)
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
- `TASK-battle-panel-health-bar-widget-turn-order-strip.md` (open)

## Files

Implemented (verified 2026-10-23):
- `src/frontend/battle/panel.ts` — battle panel mount/state/keyboard
- `src/frontend/battle/commands.ts` — action set + slash-command mapping
- `src/frontend/battle/render.ts` — roster/actions DOM builders
- `src/frontend/battle/health-bar.ts` — reusable HP progressbar widget
- `src/frontend/battle/turn-order.ts` — acting-first initiative queue strip
- `src/frontend/alpine/chat-battle.ts` — chat battle mode glue
- `src/frontend/alpine/chat-actions/battle.ts` — `/attack`, `/heal`, `/battle` dispatch

Planned (do not exist yet):
- `src/frontend/battle/battle-screen.ts` — main battle page
- `src/frontend/battle/battle-state.ts` — state display component
- `src/frontend/battle/action-selector.ts` — action selection UI
- `src/frontend/battle/battle-log.ts` — battle log component
- `src/frontend/battle/skill-check.ts` — dice roll animation
- `src/frontend/battle/status-effects.ts` — status effect badges
- `src/frontend/alpine/battle.ts` — standalone Alpine battle logic (chat-battle.ts covers the chat surface)

## Related Epics

- `epic-battle-action-systems.md` — backend battle mechanics this panel drives
- `epic-battle-integration-gaps.md` — social/item backends not yet exposed on the action bar
- `epic-rpg-mechanics.md` — stats, dice, damage calculation
- `epic-resolution-system.md` — unified dice resolution for skill-check UI
