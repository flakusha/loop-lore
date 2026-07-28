# TASK: Local Random Event Generator

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-emergent-narrative-design

## Summary

Inject low-stakes stochastic events to keep chats alive.

## Problem

Chats can feel static without ambient activity. Random events add life without requiring GM intervention.

## Scope

- Generate low-stakes events based on world/location context
- Events should be contextually appropriate (no dragons in a coffee shop)
- Frequency configurable per chat/world
- Events injected into context as background flavor

## Acceptance Criteria

- [ ] Random event generator based on world/location context
- [ ] Configurable frequency per chat/world
- [ ] Events injected into prompt as background context
- [ ] Tests: events match context, frequency respected

## Files

- `src/chat/random-events.ts` (new)
- `src/chat/context-window.ts` (modify)

## Related

- Epic 36 (Chat Lifecycle & Moderation)
- TASK-world-event-system.md — dynamic world events, timeline
- TASK-random-encounters-events.md — structured encounter tables, event chains

## Completion Note

Created src/chat/random-events.ts — stochastic ambient events for chat life
