<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Battle & Combat UI

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Partially shipped — chat battle panel with roster HP, keyboard nav, and a full action bar (attack/heal/end, item-use menu, social verbs incl. negotiate) is live, plus a reusable health-bar widget, an acting-first turn-order strip (verified 2026-10-23), and — delivered in the payload, not faked client-side — status-effect badges and a scrollable battle log (verified 2026-11-01: `serializeBattle` now carries `Combatant.conditions` and the battle log) plus environmental-effect badges in the panel header (verified 2026-11-02: `serializeBattle` carries `environmentalEffects`). The skill-check/dice-roll slice landed (verified 2026-11-05, reconciled 2026-11-06 as `a07f3ce89` + `181971f9a`, ticket now Done): `serializeBattle` projects the persisted attack roll into the panel payload and the battle log renders a roll chip (dice face, natural/modifier/total/DC, success/failure outcome, critical indicator) with a CSS dice tumble and a small-width rule; the outcome word and the critical-fail marker come from the backend's own `hit` / `criticalMiss` verdict (delivered in the payload), not from a client-side total-vs-DC guess; sound effects stay out (no audio asset pipeline in the repo, optional AC). The acceptance criteria were reconciled against the shipped code on 2026-11-06: action selection, the skill-check UI, environmental effects, mobile responsiveness and accessibility are ticked with file:line citations. Target selection and action cost display are wired and ticked (verified 2026-11-07): `renderTargetSelector` (`src/frontend/battle/target-selection.ts:14`, imported at `src/frontend/battle/panel.ts:48`, mounted at `src/frontend/battle/panel.ts:228`) and `renderActionCost` (`src/frontend/battle/action-cost.ts:13`), so all 12 acceptance criteria are ticked as of 2026-11-07. Honest remainders: no backend verb accepts multiple targets, so no area-targeting option is offered; the battle engine tracks no cooldowns, so there is no cooldown to display; and only the negotiate verb rolls dice — intimidate/taunt/surrender persist narration only (`src/rpg/service/battles/social.ts`). A flee action stays unwired by design: no backend verb or route exists for it.
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
| Skill check UI (dice animation) | Shipped (attack + negotiate rolls) | `src/frontend/battle/skill-check-display.ts` + `src/frontend/battle/skill-check.ts` + `src/frontend/battle/battle-log.ts` (rolls delivered by `serializeBattle`); deterministic verbs (intimidate/taunt/surrender) persist narration only — no die behind them |
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
- [x] Action selection interface with all action types (`renderActions` in `src/frontend/battle/render.ts:138` builds the toolbar: `ACTIONS` in `src/frontend/battle/commands.ts:109` — attack/heal/end — plus the item-use menu and `SOCIAL_ACTIONS` in `src/frontend/battle/commands.ts:116` — intimidate/taunt/negotiate/surrender; the combat and social kinds dispatch through `battleCommandFor` in `src/frontend/battle/commands.ts:204` and the item rows through `battleItemCommandFor` in `src/frontend/battle/commands.ts:245`; verified 2026-11-06 — the bar covers every action type the player-facing battle commands expose: `/attack`, `/heal` and `/battle start|status|align|use|social|end` (`src/assistant/commands/battle.ts:171`), whose social verbs are limited to `src/rpg/service/battles/types.ts:100`; the panel ships no button for defend/spell/ability/flee because they have no such command — the combat layer's `cast_spell` action type (`src/rpg/combat/types.ts:46`) and the `/api/battle/resolution/defense` route (`src/routes/battle/resolution.ts:82`) are not surfaced as panel actions)
- [x] Target selection for single/self actions (`renderTargetSelector` in `src/frontend/battle/target-selection.ts:14` builds the panel's radiogroup picker from the roster, imported at `src/frontend/battle/panel.ts:48` and mounted between roster and action bar at `src/frontend/battle/panel.ts:228`; the acting combatant is surfaced as the self-target option, defeated combatants as disabled options; drives the same selection state as the roster tiles; verified 2026-11-07. Remainder: area targeting — no backend verb accepts multiple targets, so no area option is offered)
- [x] Action cost display (`renderActionCost` in `src/frontend/battle/action-cost.ts:13` renders the badge — `N AP` / `Nt cooldown` spans — and the per-button labels live in the panel wiring: `actionCostLabel` in `src/frontend/battle/render.ts:141` returns `1 AP` for attack/item and `bonus` for heal, while social verbs and end are free and carry no badge, mirroring the engine's action economy (`consumeAction` in `src/rpg/combat/actions.ts:99`, used by the attack path in `src/rpg/service/battles/actions.ts:62` and the item path in `src/rpg/service/battles/items.ts:190`); styles in `src/public/css/vn.css:1108`; verified 2026-11-07. Remainder: cooldown display — the battle engine tracks no cooldowns (the only `cooldown` in the codebase is lore-entry gating), so there is no data source to display)
- [x] Battle log with scrollable history (`src/frontend/battle/battle-log.ts`, rendered from the `serializeBattle`-delivered log; keyboard-focusable, auto-scrolls to the latest entry; verified 2026-11-01)
- [x] Skill check UI with dice roll animation (attack rolls: roll chip + CSS dice tumble in `src/frontend/battle/skill-check-display.ts` / `src/frontend/battle/skill-check.ts`, rendered on the log line in `src/frontend/battle/battle-log.ts` from the `serializeBattle`-delivered roll; verified 2026-11-05 — social negotiate rolls: `performSocialAction` in `src/rpg/service/battles/social.ts` now persists its d20 on the `CombatAction.skillCheck` field, `projectRoll` in `src/assistant/commands/battle-utils.ts` projects it into the lean roll, and the `/battle use|social` handlers re-read the battle before serializing so the fresh entry (not a stale snapshot) reaches the client; verified 2026-11-07. Remainder: intimidate/taunt/surrender persist narration only — deterministic margin math with no die behind it)
- [x] Environmental effects display (`renderEnvironmentalEffects` in `src/frontend/battle/environmental-effects.ts:23` builds the badge row, appended to the panel header in `src/frontend/battle/render.ts:50`; the effects arrive in the payload via `serializeBattle` in `src/assistant/commands/battle-utils.ts:296`, asserted in `src/rpg/service/battles-actions.test.ts:271`; verified 2026-11-06)
- [x] Mobile responsive (touch-friendly action buttons) (`@media (width <= 640px)` block in `src/public/css/vn.css:1270`: the action bar wraps (`:1275`), the buttons keep a 44px touch target (`:1279`), the roster stacks (`:1285`) and the roll chip shrinks (`:1288`); verified 2026-11-06)
- [x] Keyboard shortcuts for common actions (`src/frontend/battle/panel.ts` arrow/Enter/Space focus cycle)
- [x] Accessibility (ARIA labels, screen reader support) (the panel keeps a persistent polite live announcer (`src/frontend/battle/panel-live.ts:36`), the battle log is a labelled `role="log"` region (`src/frontend/battle/battle-log.ts:107`), the badge rows are `role="list"`/`listitem` (`src/frontend/battle/status-effects.ts:24`, `src/frontend/battle/environmental-effects.ts:30`), the HP bar is a `progressbar` with value attributes (`src/frontend/battle/health-bar.ts:41`), and the action bar is a labelled `role="toolbar"` (`src/frontend/battle/render.ts:146`); verified 2026-11-06)

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

- `TASK-battle-screen.md` (Wontfix — superseded by the shipped chat battle panel)
- `TASK-battle-alpine.md` (open)
- `TASK-battle-state-display.md` (Wontfix — superseded by the shipped chat battle panel)
- `TASK-battle-action-selector.md` (Wontfix — superseded by the shipped chat battle panel)
- `TASK-battle-log.md` (Done)
- `TASK-skill-check.md` (Done — attack-roll slice landed `a07f3ce89` + `181971f9a`; negotiate social roll landed 2026-11-07, intimidate/taunt/surrender remain narration-only)
- `TASK-health-bar.md` (Wontfix — superseded by the shipped chat battle panel)
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

Implemented (verified 2026-11-02):
- `src/frontend/battle/environmental-effects.ts` — environmental-effect badge row (header integration in `render.ts`)

Implemented (verified 2026-11-05):
- `src/frontend/battle/skill-check-display.ts` — roll chip (dice face, roll math, outcome, critical marker)
- `src/frontend/battle/skill-check.ts` — dice roll animation (`animateDiceRoll`)
- `src/frontend/battle/battle-log.ts` — roll chip on the log line (tumble guard scoped per battle; `renderBattleLog` requires the battle id)
- `src/assistant/commands/battle-utils.ts` — `serializeBattle` also delivers the projected attack roll plus the backend's `hit` / `criticalMiss` verdict

Implemented (verified 2026-11-07):
- `src/frontend/battle/target-selection.ts` — `renderTargetSelector` (roster-derived radiogroup picker, acting combatant as self-target, defeated options disabled; imported at `src/frontend/battle/panel.ts:48`, mounted at `src/frontend/battle/panel.ts:228`)
- `src/frontend/battle/action-cost.ts` — `renderActionCost` (cost badge renderer; per-button labels from `actionCostLabel` in `src/frontend/battle/render.ts:141`); now wired into the action bar (was present-but-unwired)
- `src/rpg/combat/types.ts` — `CombatAction.skillCheck` (persisted negotiate d20)
- `src/rpg/service/battles/social.ts` — negotiate persists its d20; `/battle use|social` handlers re-read the battle before serializing so the fresh entry reaches the client
- `src/assistant/commands/battle-utils.ts` — `projectRoll` also projects social negotiate checks (own DC, backend verdict)
- `src/public/css/vn.css` — `.battle-action-cost` badge + `.battle-target-selector` picker styles

Planned (do not exist yet; not part of the skill-check slice — other lanes may own them):
- `src/frontend/battle/battle-screen.ts` — main battle page
- `src/frontend/battle/battle-state.ts` — state display component
- `src/frontend/battle/action-selector.ts` — action selection UI
- `src/frontend/alpine/battle.ts` — standalone Alpine battle logic (chat-battle.ts covers the chat surface)

## Related Epics

- `epic-battle-action-systems.md` — backend battle mechanics this panel drives
- `epic-battle-integration-gaps.md` — social/item backends not yet exposed on the action bar
- `epic-rpg-mechanics.md` — stats, dice, damage calculation
- `epic-resolution-system.md` — unified dice resolution for skill-check UI
