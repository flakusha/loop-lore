<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Battle & Combat UI

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Partially shipped — chat battle panel with roster HP, keyboard nav, and a full action bar (attack/heal/end, item-use menu, social verbs incl. negotiate) is live, plus a reusable health-bar widget, an acting-first turn-order strip (verified 2026-10-23), and — delivered in the payload, not faked client-side — status-effect badges and a scrollable battle log (verified 2026-11-01: `serializeBattle` now carries `Combatant.conditions` and the battle log). The skill-check/dice-roll slice landed (verified 2026-11-05): `serializeBattle` projects the persisted attack roll into the panel payload and the battle log renders a roll chip (dice face, natural/modifier/total/DC, success/failure outcome, critical indicator) with a CSS dice tumble and a small-width rule; the outcome word and the critical-fail marker come from the backend's own `hit` / `criticalMiss` verdict (delivered in the payload), not from a client-side total-vs-DC guess; sound effects stay out (no audio asset pipeline in the repo, optional AC). Still open for missing payload data: target selection (no area/self targets delivered), action cost and cooldown display (no per-action cost/cooldown delivered), and social skill-check rolls (`src/rpg/service/battles/social.ts` persists only the narration, so no roll reaches the client). A flee action stays unwired by design: no backend verb or route exists for it.
**Priority:** P0 — Critical
**Effort:** High
**Type:** Feature Epic
**Tags:** battle, combat, ui, frontend

## Summary

Complete battle interface for turn-based combat, including state display, action selection, turn order visualization, and battle log. Required to make the battle system usable by end users.

## Implemented (verified 2026-10-23)

- **Modules:** `src/frontend/battle/panel.ts` (VN-style overlay panel: mount/destroy/render, keyboard focus cycle over combatants + actions + items), `src/frontend/battle/commands.ts` (attack/heal/end + item toggle + social-* verb action set + slash-command mapping), `src/frontend/battle/render.ts` (header/roster/actions DOM builders), `src/frontend/battle/health-bar.ts` (reusable HP progressbar widget), `src/frontend/battle/turn-order.ts` (acting-first initiative queue strip), `src/frontend/battle/status-effects.ts` (condition badges with tooltips, rendered from the delivered conditions), `src/frontend/battle/battle-log.ts` (scrollable `role="log"` panel with latest-entry auto-scroll, rendered from the delivered log); `src/frontend/alpine/chat-battle.ts` + `src/frontend/alpine/chat-actions/battle.ts` (chat-side dispatch of `/attack`, `/heal`, `/battle` commands); backend payload: `serializeBattle` (`src/assistant/commands/battle-utils.ts`) delivers per-combatant `conditions` and the battle log
- **Shipped:** battle screen embedded in chat, combatant roster with HP display via the reusable health-bar widget, single-target selection via focus cycle, keyboard shortcuts (arrows/Enter/Space), dispatch into the backend battle routes, turn-order visualization (current turn + upcoming queue, derived from the delivered turnIndex/initiative roster), item-use menu (`/battle use`) and social verbs incl. negotiate (`/battle social`), status-effect badges with tooltips, battle log with scrollable history and auto-scroll
- **Not shipped:** flee button (no backend verb or route — `/battle social` rejects `flee`; no flee endpoint), dynamic backgrounds (the skill-check dice animation shipped 2026-11-05)

## Current State

| Surface | Status | Where |
| --- | --- | --- |
| Battle panel (roster + action bar) | Shipped | `src/frontend/battle/panel.ts`, `src/frontend/battle/render.ts` |
| Chat battle dispatch (`/attack`, `/heal`, `/battle`) | Shipped | `src/frontend/alpine/chat-battle.ts`, `src/frontend/alpine/chat-actions/battle.ts` |
| Action bar breadth (attack/heal/end, item-use, social verbs) | Shipped | `src/frontend/battle/commands.ts`, `src/frontend/battle/render.ts` (flee absent — no backend verb/route) |
| Health display (HP progressbar widget; no mana/stamina data) | Shipped (HP) | `src/frontend/battle/health-bar.ts` + roster in `src/frontend/battle/render.ts` |
| Turn order visualization | Shipped | `src/frontend/battle/turn-order.ts` (current turn + queue from delivered turnIndex/initiative) |
| Status effect badges | Shipped | `src/frontend/battle/status-effects.ts` + roster in `src/frontend/battle/render.ts` (conditions delivered by `serializeBattle`) |
| Battle log viewer | Shipped | `src/frontend/battle/battle-log.ts` + panel wiring in `src/frontend/battle/panel.ts` (log delivered by `serializeBattle`) |
| Skill check UI (dice animation) | Shipped (attack rolls) | `src/frontend/battle/skill-check-display.ts` + `src/frontend/battle/skill-check.ts` + `src/frontend/battle/battle-log.ts` (roll delivered by `serializeBattle`); social rolls still open |
| Dynamic backgrounds | Not Started | — (see `./epic-battle-action-systems.md`) |

## Unticketed Gaps (resolved / re-scoped 2026-10-23)

The earlier gap here — backend social and combat item-use routes unreachable from the UI — is closed: the shipped action bar reaches item use (`/battle use` menu) and the social verbs incl. negotiate (`/battle social`) through the chat command path, ticketed and shipped (verified 2026-10-23). The remaining backend-backed display gaps are closed too (verified 2026-11-01): `serializeBattle` now delivers `Combatant.conditions` and the battle log in the panel payload, so the shipped status-effect badges (`src/frontend/battle/status-effects.ts`) and battle log (`src/frontend/battle/battle-log.ts`) render real payload fields — nothing is faked client-side. A flee action has no backend at all (no verb in `/battle social`, no flee endpoint). The reusable health-bar widget exists (`src/frontend/battle/health-bar.ts`); beyond the new battle badges, the other status-effect surface remains character-condition state in `src/frontend/alpine/rpg-stats.ts` (`statusEffects`).

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
- [x] Status effects shown as badges with tooltips (`src/frontend/battle/status-effects.ts`, rendered from the `serializeBattle`-delivered conditions; verified 2026-11-01)
- [x] Turn order visualization shows current turn and queue (`src/frontend/battle/turn-order.ts`, verified 2026-10-23)
- [ ] Action selection interface with all action types
- [ ] Target selection for single/area/self actions
- [ ] Action cost and cooldown display
- [x] Battle log with scrollable history (`src/frontend/battle/battle-log.ts`, rendered from the `serializeBattle`-delivered log; keyboard-focusable, auto-scrolls to the latest entry; verified 2026-11-01)
- [x] Skill check UI with dice roll animation (attack rolls: roll chip + CSS dice tumble in `src/frontend/battle/skill-check-display.ts` / `src/frontend/battle/skill-check.ts`, rendered on the log line in `src/frontend/battle/battle-log.ts` from the `serializeBattle`-delivered roll; verified 2026-11-05 — social skill-check rolls still open, no roll reaches the client)
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
- `TASK-battle-log.md` (Done)
- `TASK-skill-check.md` (In Progress)
- `TASK-health-bar.md` (Not Started)
- `TASK-status-effects.md` (Done)
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

Implemented (verified 2026-11-01):
- `src/frontend/battle/status-effects.ts` — status-effect badges (roster integration in `render.ts`)
- `src/frontend/battle/battle-log.ts` — battle log panel (panel integration in `panel.ts`)
- `src/assistant/commands/battle-utils.ts` — `serializeBattle` now delivers conditions + log

Implemented (verified 2026-11-05):
- `src/frontend/battle/skill-check-display.ts` — roll chip (dice face, roll math, outcome, critical marker)
- `src/frontend/battle/skill-check.ts` — dice roll animation (`animateDiceRoll`)
- `src/frontend/battle/battle-log.ts` — roll chip on the log line (tumble guard scoped per battle; `renderBattleLog` requires the battle id)
- `src/assistant/commands/battle-utils.ts` — `serializeBattle` also delivers the projected attack roll plus the backend's `hit` / `criticalMiss` verdict

Planned (do not exist yet):
- `src/frontend/battle/battle-screen.ts` — main battle page
- `src/frontend/battle/battle-state.ts` — state display component
- `src/frontend/battle/action-selector.ts` — action selection UI
- `src/frontend/alpine/battle.ts` — standalone Alpine battle logic (chat-battle.ts covers the chat surface)

## Related Epics

- `epic-battle-action-systems.md` — backend battle mechanics this panel drives
- `epic-battle-integration-gaps.md` — social/item backends not yet exposed on the action bar
- `epic-rpg-mechanics.md` — stats, dice, damage calculation
- `epic-resolution-system.md` — unified dice resolution for skill-check UI
