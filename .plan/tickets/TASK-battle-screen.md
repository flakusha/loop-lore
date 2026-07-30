# TASK: Battle Screen

**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** Medium
**Type:** Feature Task
**Tags:** battle, frontend, ui
**Epic:** epic-battle-ui.md

## Summary

Main battle page layout integrating all battle components (state display, action selector, log).

## Core Features

- Battle screen container
- Component integration
- Responsive layout
- Real-time updates via SSE
- Mobile responsive

## Acceptance Criteria

- [ ] Battle screen with full layout
- [ ] Components integrated: state display, action selector, log
- [ ] SSE connection for real-time updates
- [ ] Mobile responsive design
- [ ] Keyboard navigation

## Implementation Notes

- Use htmx + Alpine.js
- Integrate with existing `src/rpg/` systems
- Connect to `battle-state-display` and `battle-action-selector` tasks

## Files to Create

- `src/frontend/battle/battle-screen.ts`
- `src/frontend/battle/battle-layout.ts`

## Related Tasks

- TASK-battle-state-display.md — Health/status display
- TASK-battle-action-selector.md — Action buttons
