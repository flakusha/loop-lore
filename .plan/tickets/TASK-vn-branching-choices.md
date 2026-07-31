# TASK: Visual Novel Mode — Branching Choices & Relationship Impact

**Priority:** Medium
**Status:** ✅ Complete
**Epic:** epic-immersion-presentation
**Tags:** visual-novel, branching, choices, relationships, immersion

## Description

Extend the Visual Novel Mode spec with branching choices and relationship impact — choices made during VN scenes affect character relationships, world state, and future scene availability. Adds narrative depth to the visual novel experience.

## How It Extends Existing Work

Builds on the Visual Novel Mode UX spec (`docs/frontend/chat/visual-novel-mode.md`) and the Character Core System's relationship and mood systems. Adds choice-driven narrative branching on top of the existing VN layout.

## Acceptance Criteria

- [ ] Branching choice UI (choice cards with preview text)
- [ ] Choice consequences tracked per scene
- [ ] Relationship impact from choices (affects existing relationship system)
- [ ] Mood/state changes from choices (affects existing mood system)
- [ ] Scene unlock/lock based on previous choices
- [ ] Choice history panel — review past decisions
- [ ] Multiple endings based on choice accumulation
- [ ] `POST /api/chat/:id/choice` — submit a choice
- [ ] `GET /api/chat/:id/choices` — list available choices
- [ ] Frontend choice cards with visual feedback
- [ ] Frontend choice history and consequence tracker

## Technical Notes

- Choices stored as structured events in the chat message stream
- Choice consequences reference existing relationship and mood APIs
- Scene unlock/lock uses the existing world/location state system
- Integrates with Chat Lifecycle & Moderation epic for choice validation
