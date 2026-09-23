<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-029: RPG Chat with Question-Based Gameplay

**Status:** ✅ Resolved (on dev, 2026-09-23)
**Priority:** medium
**Effort:** Medium
**Summary:** Question-driven RPG chat mode — GM emits structured inline questions, answers drive quest/inventory state.
**Context:** Question UI + answer orchestration; backend quest/inventory hooks already exist.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: closed
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

## Resolution

Implemented on dev by b5b90969f (worktree task-029-question-gameplay, finalized 2026-09-23):

- `src/db/migrations/007_rpg_question_answer_kinds.ts` — `input_kind` (choice/free_text/numeric), `answer_value`, `min_value`/`max_value`, `effect` columns
- `src/rpg/questions/effects.ts` — answer-driven quest progression (`upsertQuestProgress`) + item grants (`world_items`)
- `src/rpg/questions/validation.ts`, `service.ts` — per-input-kind answer validation, effectsApplied reporting, system messages for quest/item events
- `src/components/chat/rpg-questions.html`, `src/frontend/alpine/rpg-questions.ts` — text/number inputs honoring min/max, inline Retry preserving pending answers
- Git issue 9592d11 closed; duplicate open issue c712140 closed as duplicate

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
