<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Story Turn Order

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Scope:** EPIC-STORY-MODE-UI first slice: story turn-order visualization + world-state/NPC-state CRUD wiring + turn-by-id lookup (frontend wiring of existing src/routes/story-states/ backend)
**Priority:** P1 — High
**Effort:** Small
**Type:** Feature Task
**Tags:** story, frontend, ui, turn-order
**Epic:** epic-story-mode-ui

## Summary

Turn order visualization for story mode.

## Core Features

- Turn order display
- Current turn indicator
- Initiative tracking
- Turn actions

## Acceptance Criteria

- [ ] Turn order display
- [ ] Current turn indicator
- [ ] Initiative tracking
- [ ] Available actions per turn
- [ ] Mobile responsive

## Files to Create

- `src/frontend/alpine/story-turn-order.ts` — Alpine `storyTurnOrder()` component (supersedes the stale `src/frontend/story/*` paths below — that tree never existed; Alpine modules are canonical per the epic's Frontend Surface section)
- `src/frontend/alpine/story-turn-order.test.ts`
- `src/components/chat/gm-story-turn-order.html`

<details><summary>Stale original list (kept for history)</summary>

- `src/frontend/story/turn-order.ts`
- `src/frontend/story/turn-indicator.ts`

</details>

**Resolved:** 2026-11-06 registry-driven close: git issue 717dcf3 (registry tip: 386e87131 Konstantin Fedotov Close issue)
