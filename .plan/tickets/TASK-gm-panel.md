<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: GM Panel

**Status:** 🟡 In Progress — notes panel done, world/NPC/event/scene controls pending (2026-08-01)
**Priority:** P1 — High
**Effort:** Medium
**Type:** Feature Task
**Tags:** story, frontend, ui, gm, panel
**Epic:** epic-story-mode-ui.md

## Summary

GM control panel for story mode. Panel shell exists as GM sidebar with whitenotes + shadow notes tabs; world-state/NPC/event/scene controls not yet built.

## Core Features

- ✅ GM panel sidebar + Alpine component with whitenotes/shadow notes CRUD (`src/components/chat/gm-panel.html`, `src/frontend/alpine/gm-panel.ts` — included in `src/views/chat.html:28`)
- ❌ World state controls
- ❌ NPC management
- ❌ Event triggers
- ❌ Scene management
- ❌ Mobile responsive

## Acceptance Criteria

- [ ] World state controls
- [ ] NPC quick management
- [ ] Event trigger buttons
- [ ] Scene management
- [ ] Mobile responsive

## Files to Create

- `src/frontend/story/gm-panel.ts`
- `src/frontend/story/gm-controls.ts`
