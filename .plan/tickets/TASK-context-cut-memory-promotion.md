# TASK: Context Cut & Memory Promotion

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

## Summary

Auto-promote important context on window overflow.

## Problem

When context window fills up, old messages are trimmed. Important context (key decisions, character moments) should be promoted to memory before trimming.

## Scope

- Detect when context window approaches token limit
- Score messages for importance (character moments, decisions, plot points)
- Promote high-score messages to memory before trimming
- Append transitional system message on context cut

## Acceptance Criteria

- [ ] Context cut triggers on token limit approaching
- [ ] Messages scored for importance before trimming
- [ ] High-score messages promoted to memory
- [ ] Transitional system message appended
- [ ] Tests: promotion happens, transitions logged

## Files

- `src/chat/context-window.ts` (modify)
- `src/chat/transitions.ts` (modify)

## Related

- TASK-memory-promotion-pipeline.md — extraction pipeline
- TASK-smart-context-pruning.md — pruning logic
- Epic 36 (Chat Lifecycle & Moderation)

## Completion Note

Created src/chat/memory-promotion.ts — bridges pruning to memory storage
