<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-029: RPG Chat with Question-Based Gameplay

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Question-driven RPG chat mode — GM emits structured inline questions, answers drive quest/inventory state.
**Context:** Question UI + answer orchestration; backend quest/inventory hooks already exist.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Effort**: Medium
**Labels**: rpg, chat, gameplay, quests
**Assignee**:
**Epic**: epic-rpg-content-systems
**Related**:

## Summary

Implement question-driven RPG chat: the GM (LLM or scripted) prompts the player with structured questions whose answers drive quest state, inventory, and character progression.

## Context

See epic-rpg-content-systems.md "RPG Chat (Question-Based Gameplay)" section for full design. Backend hooks (quest advancement, item grants) already exist; this ticket delivers the chat UX and question/answer orchestration. IN: question prompt UI, answer validation, quest state transitions. OUT: GM authoring tools, world building, lore authoring.

## Acceptance Criteria

- GM can emit a structured question (choice, free-text, numeric) inline in chat
- Player answers route to the quest engine and update quest/inventory state
- Invalid or out-of-range answers surface an inline retry without losing prior answers
- Question state is persisted with chat history and survives reconnect
- Quest progression events emit to the chat timeline as system messages

## Related Files

- src/rpg/quests.ts (to be created)
- src/components/chat/QuestionPrompt.vue (to be created)
- src/views/chat/ChatView.vue
- .plan/epics/epic-rpg-content-systems.md

## Notes

- Coordinate with battle/dice tickets when RPG questions overlap with action resolution
- Sibling of TASK-030 (Character Creator Prerogative) — both touch character state shape

Git issue: `9592d11`
