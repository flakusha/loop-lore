<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Status Effects Display

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** P0 — Critical
**Effort:** Small
**Type:** Feature Task
**Tags:** battle, frontend, ui, status-effects
**Epic:** epic-battle-ui

## Summary

Status effect badges displaying active effects on entities.

## Core Features

- Effect badges with icons
- Duration indicators
- Stack count display
- Tooltip with effect details

## Acceptance Criteria

- [x] Status effect badges with icons (text badges — conditions are plain strings in the payload, so no icon set is rendered yet)
- [ ] Duration countdown display (conditions carry no duration data — adding it needs backend payload work, not client-side inference)
- [ ] Stack count for stacking effects (conditions are plain strings with no stack counts)
- [x] Tooltip showing effect details
- [x] Mobile responsive

## Files

- `src/frontend/battle/status-effects.ts` (badge row only — no separate `status-badge.ts` needed)
- Roster integration in `src/frontend/battle/render.ts`

**Resolved:** 2026-11-01 registry-driven close: git issue e339f33 (registry tip: 38b4160a6 Konstantin Fedotov Close issue)
