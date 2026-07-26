# TASK: Visual Novel Mode — Q&A (Question <-> Answer) Mode

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-visual-novel-mode
**Tags:** visual-novel, qa-mode, interactive-story, branching, chat-mode

## Description

Add a question<->answer mode to Visual Novel Mode that supports structured Q&A interactions within VN scenes. Players ask questions, characters respond with emotion/expression changes, and answers drive scene branching. Supports lore, relationship, combat, exploration, and social question types.

## How It Extends Existing Work

Builds on `TASK-visual-novel-mode.md` (base VN rendering), `TASK-vn-branching-choices.md` (branching choices), and `TASK-vn-dynamic-generation.md` (dynamic generation). Adds Q&A interaction pattern on top of the existing VN infrastructure.

## Acceptance Criteria

- [ ] Q&A interaction pattern within VN scenes (question card UI)
- [ ] Question types: lore, relationship, combat, exploration, social
- [ ] Player questions trigger character responses with emotion/expression changes
- [ ] Answer-driven scene branching (different answers → different scenes)
- [ ] Q&A session persistence across chat turns
- [ ] Question scoring and consequence tracking
- [ ] Combined mode: VN scenes with both dynamic generation AND Q&A
- [ ] Scene transitions triggered by Q&A outcomes
- [ ] Dynamic images update based on Q&A choices
- [ ] Story generation adapts to Q&A context
- [ ] `POST /api/chat/:id/vn/question` — submit a question
- [ ] `GET /api/chat/:id/vn/questions` — list available questions
- [ ] Frontend Q&A card UI with question types and options
- [ ] Frontend Q&A consequence tracker
- [ ] Config: enable/disable Q&A mode per world/chat

## Technical Notes

- Questions stored as structured events in the chat message stream
- Q&A consequences reference existing relationship, mood, and world state APIs
- Scene transitions use the existing VN scene management system
- Integrates with Chat Lifecycle & Moderation epic for choice validation
- Integrates with Character Core System for relationship/mood impact
