# TASK: Wire chat transitions into message pipeline

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-logic-reconciliation

## Summary

`detectTransitionType()`, `isTransitionMessage()`, and `createTransition()` in `src/chat/transitions.ts` are fully implemented but never called. Scene changes, context cuts, and location changes are never detected or processed.

## Current State

- `isTransitionMessage()` — detects scene change patterns in user messages
- `detectTransitionType()` — classifies as location_change, context_cut, or description
- `createTransition()` — creates transition event with promoted memory IDs
- `selectMessagesForPromotion()` — selects messages to promote during context cut
- `promoteMessagesToMemories()` — stores promoted messages as long-term memories
- All exported from `chat/index.ts`
- Never imported by any route or service

## Fix

In `routes/messages.ts` POST `/api/chats/:id/messages`:

1. After saving user message, call `isTransitionMessage()` on content
2. If true, call `detectTransitionType()` to determine type
3. If location_change, update chat location
4. If context_cut, call `selectMessagesForPromotion()` + `promoteMessagesToMemories()`
5. Create transition event via `createTransition()`

## Acceptance Criteria

- [ ] Transition messages detected after user sends message
- [ ] Location changes update chat location
- [ ] Context cuts promote messages to memory
- [ ] Tests pass: `bun test src/chat/ src/routes/`
