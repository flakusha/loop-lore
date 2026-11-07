<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Health Bar Component

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Wontfix
**Status Note:** superseded as a standalone component — the reusable HP progressbar widget shipped as `src/frontend/battle/health-bar.ts` (rendered by `src/frontend/battle/render.ts`, styled in `src/public/css/vn.css:938`); regeneration/damage indicators were never built and no separate NPC-view consumer exists.
**Priority:** P0 — Critical
**Caveats:** superseded — no new code; stale-state risk if the battle panel regresses
**Effort:** Small
**Type:** Feature Task
**Tags:** battle, frontend, ui, health, component
**Epic:** epic-battle-ui

## Summary

Reusable health bar component for displaying entity health.

## Core Features

- Animated fill transition
- Color coding (green→yellow→red)
- Numeric display
- Regeneration/damage indicators

## Acceptance Criteria

- [ ] Animated health bar with smooth transitions
- [ ] Color coding based on health percentage
- [ ] Numeric health display (current/max)
- [ ] Regeneration/damage indicators
- [ ] Reusable across battle and NPC views

## Files to Create

- `src/frontend/battle/health-bar.ts`
