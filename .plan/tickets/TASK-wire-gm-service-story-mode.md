# TASK: Wire GameMasterService into story mode generation

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Large
**Epic:** epic-logic-reconciliation

## Summary

`GameMasterService` (`src/story/game-master.ts`) is fully implemented and tested (13 tests) but never imported outside its test file. Story mode chats fall through to the same `triggerAutoGeneration()` path as direct/group chat, bypassing GM orchestration entirely.

## Current State

- `GameMasterService` handles: turn selection, prompt assembly, LLM decision-making, quality evaluation, world events, quest tracking, escalation
- `triggerAutoGeneration()` in `src/generation/auto-gen.ts` handles all chat types uniformly
- For `chat.type === "story"`, no GM logic is invoked
- `TurnManager` IS used by `group-chat/turn-selector.ts` for group chats, but `GameMasterService` (which wraps `TurnManager` + adds GM orchestration) is never called

## Root Cause

`generation/auto-gen.ts` line 116: `if (chat?.type === "group")` — only group chat gets special handling. Story mode gets the default LLM generation path.

## Fix

In `triggerAutoGeneration()`, when `chat.type === "story"`:

1. Instantiate `GameMasterService` with the chat's GM config
2. Call `gm.executeTurn()` to get the next actor + prompt
3. Call `gm.acceptResponse()` with the LLM response
4. Handle escalation/regeneration based on quality evaluation

## Acceptance Criteria

- [ ] Story mode chats use `GameMasterService` for turn orchestration
- [ ] LLM fallback works when GM decision fails
- [ ] Quality evaluation runs on story mode responses
- [ ] World events extracted and applied
- [ ] Tests pass: `bun test src/story/ src/generation/`
