# TASK: Related Memory & Event Injection Hooks

**Status:** ✅ Done (closed via git issue)
**Priority:** high
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

## Summary

Wire hooks for injecting related memories and active events into chat context.

## Problem

Context window needs to inject relevant memories (character, world, assistant) and active world events to bias generation. Currently no injection pipeline exists.

## Scope

- Build injection hooks in prompt assembly for memories and events
- Memory injection: query relevant memories by scope (character/world/assistant)
- Event injection: surface active world/local events relevant to current context
- Token budget allocation for memories vs events vs conversation

## Acceptance Criteria

- [ ] Memory injection hook in prompt assembly
- [ ] Event injection hook in prompt assembly
- [ ] Token budget split configurable (memories/events/conversation)
- [ ] Tests: correct memories injected per scope, events surface when active

## Files

- `src/assistant/prompt/sections/memories.ts` (modify)
- `src/assistant/prompt/sections/events.ts` (new)
- `src/chat/context-window.ts` (modify)

## Related

- TASK-memory-provision-wiring.md — memory filtering
- TASK-smart-context-pruning.md — context pruning
- Epic 36 (Chat Lifecycle & Moderation)

## Completion Note

Event injection section created in prompt assembly (events.ts) + random event generator (random-events.ts)
