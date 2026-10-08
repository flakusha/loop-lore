<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Story Alpine.js Logic

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Status Note:** 2026-08-14 — story-state.ts + story-controls.ts built + tested in worktree story-chat-view
**Priority:** P1 — High
**Effort:** Medium
**Type:** Feature Task
**Tags:** story, frontend, alpine, logic
**Epic:** epic-story-mode-ui

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

## Clarification 2026-09-26

Current behavior: `window.storyState` ships from `src/frontend/alpine/story-state.ts:41-86` with split modules `story-state/{api,derived,loaders,types}.ts`. `refresh()` (lines 65-86) re-pulls via `_loadChat` then `Promise.allSettled([_loadTurns, _loadQuests, _loadWorldState, _loadParticipants])`; `init()` is `refresh()`. Quest create hits `/api/v1/worlds/:worldId/quests` (`story-state.ts:137`); delete hits `/api/v1/quests/:id` (`story-state.ts:156`) — both versioned, contra the ticket scope's unversioned paths. Covered by `src/frontend/alpine/story-state.test.ts` (13.6KB).

Scope disambiguation: 4 of 5 criteria are done; the ONLY open item is SSE updates. `refresh()` re-pull is the interim path by design — the live path must subscribe to the world-scoped snapshot/event SSE feed tracked in open git issue `580d430` (2D-world review), not invent a story-local socket. No `EventSource` exists anywhere under `story-state/` today.

Scoped next step: file/confirm a `CLARIFY-` follow-up for the SSE subscription (feed contract from `580d430`, reconnect + stale-chatId guard), keep re-pull as fallback. Related: `93521c5` (music panel stale after in-page chat switch — same stale-panel class; `refresh()` re-reads `_activeChatId()` each call, verify the switch path re-triggers it).

Acceptance:

- [ ] SSE subscription follow-up filed with feed contract + fallback behavior
- [ ] `refresh()` re-pull retained as the offline/fallback path (not removed)
- [ ] Chat-switch re-triggers `refresh()` (no stale story panel)
