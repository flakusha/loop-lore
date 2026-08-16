<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Story Alpine.js Logic

**Status:** 🟡 In Progress (2026-08-14 — story-state.ts + story-controls.ts built + tested in worktree story-chat-view)
**Priority:** P1 — High
**Effort:** Medium
**Type:** Feature Task
**Tags:** story, frontend, alpine, logic
**Epic:** epic-story-mode-ui.md

## Summary

Alpine.js state management for story mode.

## Core Features

- Story state — `src/frontend/alpine/story-state.ts` (registered as `window.storyState`; loads turns/quests/world state/participants; derives running/turnNumber/nextActorName/worldName/banners; quality tiers via `qualityClass`)
- Quest state — `_loadQuests`/`createQuest`/`deleteQuest` against /api/worlds/:worldId/quests + /api/quests/:id; `questProgressPct` clamp; `_parseQuestBanners` from turn `quest_progress` JSON
- GM state — role mapping (assistant → gm) from participants; turn order list; world state chips (time/weather/atmosphere/NPCs)
- Turn state — `turnMeta` keyed by `parent_message_id` for per-message quality badges; latest-turn running/promptSent

## Acceptance Criteria

- [x] Story state management (story-state.ts + tests)
- [x] Quest state tracking (+ tests)
- [x] GM state management (+ tests)
- [x] Turn state management (+ tests)
- [ ] SSE updates — pending LLM-role-wiring SSE stream; refresh() re-pull is the interim path
