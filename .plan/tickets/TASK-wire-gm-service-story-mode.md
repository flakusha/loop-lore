# TASK: Wire GameMasterService into story mode generation

**Status:** ✅ Complete (2026-08-01 — code-verified)
**Priority:** High
**Effort:** Large
**Epic:** epic-logic-reconciliation

## Summary

`GameMasterService` (`src/story/game-master.ts`) is fully implemented and tested (13 tests) but never imported outside its test file. Story mode chats fall through to the same `triggerAutoGeneration()` path as direct/group chat, bypassing GM orchestration entirely.

## Current State (2026-08-01 review — COMPLETED)

- `triggerAutoGeneration()` dispatches to `triggerStoryModeGeneration()` when `chat.mode === "story"` (`src/generation/auto-gen.ts:184`)
- `triggerStoryModeGeneration` (auto-gen.ts:792) instantiates `GameMasterService`, `initialize()` → `executeTurn()` → hallucination guard → message insert → `acceptResponse()`
- LLM decision strategy via `GM_DECISIONS` registry with fallback to `Llm` when config `type` missing
- GM config parsed as `GameMasterConfig`; invalid/absent config → graceful skip with warn log
- Tested: `src/story/game-master.test.ts` (13 tests) + story mode integration path

Remaining gap (separate tickets): UI cannot author `GameMasterConfig.type` (frontend `GmConfig` writes only `assistantRole`/`visualNovel` → story mode always falls back to LLM strategy; human/hybrid GM unreachable from UI).

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
