# TASK: Battle Log

**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** Small
**Type:** Feature Task
**Tags:** battle, frontend, ui, log
**Epic:** epic-battle-ui.md

## Summary

Battle log component showing combat events, actions, and results.

## Core Features

- Scrollable log container
- Action type indicators (attack, skill, item, move)
- Critical hit/damage highlighting
- Turn separators
- Auto-scroll to latest

## Acceptance Criteria

- [ ] Battle log with scrollable container
- [ ] Action type indicators with colors
- [ ] Critical hit/damage highlighting
- [ ] Turn separators
- [ ] Auto-scroll to latest events
- [ ] Mobile responsive

## Implementation Notes

- Use htmx + Alpine.js
- Log data from SSE stream

## Files to Create

- `src/frontend/battle/battle-log.ts`
- `src/frontend/battle/battle-log-entry.ts`

## Related Tasks

- TASK-battle-state-display.md
- TASK-battle-action-selector.md
