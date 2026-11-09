<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Quest Log

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Status Note:** 2026-11-09 (T4 core-t4-story): Active/History split shipped (`activeQuests()`/`completedQuests()` + gm-quests-panel.html sections + `story.questHistory` i18n); mobile responsive remains open.
**Priority:** P1 — High
**Effort:** Medium
**Type:** Feature Task
**Tags:** story, frontend, ui, quest, log
**Epic:** epic-story-mode-ui

## Summary

Quest log display for active/completed quests.

## Core Features

- Quest list
- Quest details
- Progress tracking
- Quest rewards

## Acceptance Criteria

- [x] Active quests list (`activeQuests()` in `src/frontend/alpine/story-state/derived.ts`, Active section of `src/components/chat/gm-quests-panel.html`)
- [x] Completed quests list (`completedQuests()` in `src/frontend/alpine/story-state/derived.ts`, Quest History section of `src/components/chat/gm-quests-panel.html`)
- [x] Quest details display (quest rows via `GET /api/v1/worlds/:worldId/quests` paged walk in `src/frontend/alpine/story-state/api.ts`)
- [x] Progress tracking (`questProgressPct` in `src/frontend/alpine/story-state/derived.ts`)
- [x] Quest rewards display (`questRewardChips` + `questMilestones` in `src/frontend/alpine/story-state/derived.ts`)
- [ ] Mobile responsive

## T4 note (2026-11-09, core-t4-story)

Implemented at the actual module paths (`src/frontend/alpine/story-state/`, not the
`src/frontend/story/` paths named in Files to Create — that tree was never created).
Only Mobile responsive remains open; everything else verified with tests green.

## Files to Create

- `src/frontend/story/quest-log.ts`
- `src/frontend/story/quest-item.ts`
