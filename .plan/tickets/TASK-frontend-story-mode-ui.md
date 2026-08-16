<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend Story Mode UI

**Status:** 🟡 In Progress (2026-08-14 — story view header, GM story panel, quest log, quality badges built in worktree story-chat-view; backend orchestration endpoints pending LLM-role-wiring workstream)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-assistant-gm-flows

## Summary

Frontend story mode UI: GM panel, quest log, story chat, multi-LLM story display. Backend src/story/ exists, no frontend. From docs/frontend/chat/multi-llm-story.md.

## Progress (worktree story-chat-view)

Built (uncommitted in worktree):

- `src/frontend/alpine/story-state.ts` — story Alpine store: chat/turn/quest/world-state/participant loading, `isStoryMode` detection (mode === "story" || gm_config.storyMode), derived running/turnNumber/nextActorName, quality tiers, control delegation. Unit tests: `story-state.test.ts` (20 tests).
- `src/frontend/alpine/story-controls.ts` — orchestration client (pause/resume/step/escalate/narration → POST /api/chats/:id/story/{action}); graceful `{ok:false}` until LLM-role-wiring lands. Unit tests: `story-controls.test.ts` (9 tests).
- `src/components/chat/story-view.html` — story header bar (world name, quest chips, pause/step, GM Panel + Quest Log toggles), GM selection strip, quest banners.
- `src/components/chat/gm-story-panel.html` — GM "Story" tab: status bar, turn order, active quests with progress + create/delete, world state (time/weather/atmosphere/NPCs), controls.
- `src/components/chat/quest-log-panel.html` — Quest Log slide-in (📜 toggle, `$store.ui.showQuestLog`).
- `src/components/chat/message-list.html` — quality score badge (turnForMessage(msg.id) + qualityClass, tiered styling).
- `src/public/css/story.css` — themed (accent-primary/border-default/text-tertiary/space-*) with fallbacks.
- Wired: chat.html story-layout wrapper (`x-data="storyState()"`), gm-panel Story tab + `gm-panel.ts` activeTab union, ui-store `showQuestLog`, chat-header 📜 button, input-area story footer + disable-while-running, index.ts imports, layout.html css link, en.json `story.*` keys.

## Acceptance Criteria

- [x] Story mode header + GM selection strip
- [x] GM control panel (turn order, quests, world state, controls)
- [x] Quest log panel
- [x] Quality score badges on messages
- [x] Story Alpine store + controls client (unit-tested)
- [ ] Backend orchestration endpoints (LLM-role wiring) — UI already degrades gracefully
- [ ] Browser e2e coverage (after endpoints land)
- [ ] Documentation updated
