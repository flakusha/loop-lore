<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Battle Log

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** P0 — Critical
**Effort:** Small
**Type:** Feature Task
**Tags:** battle, frontend, ui, log
**Epic:** epic-battle-ui

## Summary

Battle log component showing combat events, actions, and results.

## Core Features

- Scrollable log container
- Action type indicators (attack, skill, item, move)
- Critical hit/damage highlighting
- Turn separators
- Auto-scroll to latest

## Acceptance Criteria

- [x] Battle log with scrollable container
- [x] Action type indicators with colors
- [x] Critical hit/damage highlighting
- [ ] Turn separators (the payload's log entries carry no round/turn markers — `CombatAction` has none; adding them needs backend payload data, not client-side inference)
- [x] Auto-scroll to latest events
- [x] Mobile responsive

## Implementation Notes

- Use htmx + Alpine.js
- Log data is delivered in the `battle-*` command action payload: `serializeBattle` (`src/assistant/commands/battle-utils.ts`) maps `battle.log` to lean entries (type, damage, critical, description)


## Files

- `src/frontend/battle/battle-log.ts` (entry rendering included — no separate `battle-log-entry.ts` needed)
- Panel wiring in `src/frontend/battle/panel.ts`

## Related Tasks

- TASK-battle-state-display.md
- TASK-battle-action-selector.md

**Resolved:** 2026-11-01 registry-driven close: git issue 611b7f7 (registry tip: f3af92fdc Konstantin Fedotov Close issue)
