<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Battle Screen

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Wontfix
**Status Note:** superseded as a standalone page — the battle screen shipped as the chat-embedded panel (`src/frontend/battle/panel.ts`, mounted by `src/frontend/alpine/chat-battle.ts`); updates are refresh-driven, not SSE. Remaining battle gaps are tracked in `epic-battle-ui.md`.
**Priority:** P0 — Critical
**Caveats:** superseded — no new code; stale-state risk if the chat battle panel regresses
**Effort:** Medium
**Type:** Feature Task
**Tags:** battle, frontend, ui
**Epic:** epic-battle-ui
**Also Linked:** epic-frontend-backend-integration.md
**Superseded By:** TASK-battle-frontend-integration.md (comprehensive integration task)

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
