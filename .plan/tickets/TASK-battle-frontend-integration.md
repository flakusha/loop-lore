# TASK: Battle Frontend Integration

**Status:** ⬜ Not Started
**Priority:** P0
**Effort:** High
**Epic:** epic-frontend-backend-integration
**Tags:** battle, frontend, combat, ui

## Summary

Create the full battle interface for turn-based combat. Backend routes exist at `/api/battle/*` (equipment, social, NPC, weather, resolution, morale) but no frontend UI exists.

## Current State

- No frontend code for battle
- Backend has full battle system in `src/rpg/combat.ts` + `src/routes/battle.ts`
- Battle UI epic (`epic-battle-ui.md`) has detailed component specs but no implementation

## What to Implement

### Phase 1: Core Battle Display

- Battle screen container with responsive layout
- Health/mana/stamina bars for all participants
- Status effect badges (buffs/debuffs)
- Turn order visualization (current turn, queue, initiative)

### Phase 2: Action Selection

- Action button grid (attack, defend, item, spell, ability, flee, negotiate)
- Target selection modal (single, area, self)
- Action cost display (mana, stamina, items)
- Cooldown indicators
- Action confirmation dialog

### Phase 3: Battle Log

- Scrollable battle history
- Filter by action type
- Expandable details

### Phase 4: Skill Checks

- Dice roll animation
- Result display (success/failure/critical)
- Modifier breakdown
- Narrative result text

## Files to Create

- `src/frontend/battle/battle-screen.ts` — Main battle page
- `src/frontend/battle/battle-state.ts` — State display component
- `src/frontend/battle/action-selector.ts` — Action selection UI
- `src/frontend/battle/battle-log.ts` — Battle log component
- `src/frontend/battle/skill-check.ts` — Dice roll animation
- `src/frontend/battle/health-bar.ts` — Reusable health bar
- `src/frontend/battle/status-effects.ts` — Status effect badges
- `src/frontend/alpine/battle.ts` — Alpine.js battle logic
- `src/components/battle/battle-screen.html` — Battle screen template
- `src/components/battle/action-selector.html` — Action selector template

## Acceptance Criteria

- [ ] Battle screen with full layout
- [ ] Health/mana/stamina bars for all participants
- [ ] Status effect badges
- [ ] Turn order visualization
- [ ] Action selection interface with all action types
- [ ] Target selection for single/area/self actions
- [ ] Action cost and cooldown display
- [ ] Battle log with scrollable history
- [ ] Skill check UI with dice roll animation
- [ ] SSE connection for real-time updates
- [ ] Mobile responsive design
- [ ] Keyboard navigation

## Related

- `epic-battle-ui.md` — Battle UI epic (detailed specs)
- `epic-battle-action-systems.md` — Backend battle systems
- `epic-battle-integration-gaps.md` — Battle integration
- `TASK-battle-screen.md` — Existing task (needs updating)
- `TASK-battle-state-display.md` — Existing task
- `TASK-battle-action-selector.md` — Existing task
- `TASK-battle-log.md` — Existing task
- `TASK-skill-check.md` — Existing task
