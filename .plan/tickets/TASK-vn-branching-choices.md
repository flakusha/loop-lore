<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Visual Novel Mode — Branching Choices & Relationship Impact

**Priority:** Medium
**Status:** ✅ Complete (2026-08-23) — Backend, routes, frontend cards, accumulated impacts, split/reunite detection all live
**Epic:** epic-immersion-presentation
**Tags:** visual-novel, branching, choices, relationships, immersion

## Description

Extend the Visual Novel Mode spec with branching choices and relationship impact — choices made during VN scenes affect character relationships, world state, and future scene availability. Adds narrative depth to the visual novel experience.

## How It Extends Existing Work

Builds on the Visual Novel Mode UX spec (`docs/frontend/chat/visual-novel-mode.md`) and the Character Core System's relationship and mood systems. Adds choice-driven narrative branching on top of the existing VN layout.

## Acceptance Criteria

- [x] Branching choice UI (choice cards with preview text) — `src/frontend/vn/choice-cards.ts` + `choice-cards-render.ts`
- [x] Choice consequences tracked per scene — accumulated impacts tracker in choice-cards.ts
- [x] Relationship impact from choices — references relationship system
- [x] Mood/state changes from choices — references mood system
- [x] Scene unlock/lock based on previous choices
- [x] Choice history panel — review past decisions — selection history rendered from `vn_choice_selections`
- [x] Multiple endings based on choice accumulation
- [x] `POST /api/chats/:id/vn-choices/:choiceId/select` — submit a choice (`src/routes/chats/vn-choices.ts`)
- [x] `GET /api/chats/:id/vn-choices?sceneIndex=N` — list available choices (`src/routes/chats/vn-choices.ts`)
- [x] Frontend choice cards with visual feedback
- [x] Frontend choice history and consequence tracker

## Technical Notes

- Choices stored as structured events in the chat message stream
- Choice consequences reference existing relationship and mood APIs
- Scene unlock/lock uses the existing world/location state system
- Integrates with Chat Lifecycle & Moderation epic for choice validation
