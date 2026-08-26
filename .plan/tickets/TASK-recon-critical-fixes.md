<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-recon-critical-fixes: Backend reconciliation — Phase 1 critical wiring/logic fixes

**Status:** 🟡 In Progress (1.6 auto-rename done; rest open)
**Priority:** High
**Effort:** Medium
**Type:** TASK
**Tags:** backend, wiring, logic
**Epic:** epic-logic-reconciliation
**Parent:** TASK-reconciliation-plan (umbrella)

## Summary

Wire the fully-implemented-but-never-called chat/story modules into the generation pipeline and fix the turn-number double-count bug.

## Context

The generation pipeline (`generate-route.ts` + `auto-gen.ts`) does NOT call GameMasterService, memory injection, pruning, transitions, or moderation — all implemented (some tested) but dead:

| Module                                                                                               | File                              | Lines | Tests       | Status                                            |
| ---------------------------------------------------------------------------------------------------- | --------------------------------- | ----- | ----------- | ------------------------------------------------- |
| `GameMasterService`                                                                                  | `src/story/game-master.ts`        | 271   | ✅ 13 tests | ❌ Dead code — never wired to generation pipeline |
| `injectChatMemories`                                                                                 | `src/chat/memory-injection.ts`    | 200+  | ❌ 0 tests  | ❌ Never called                                   |
| `promoteMessagesToMemory`                                                                            | `src/chat/memory-promotion.ts`    | 200+  | ❌ 0 tests  | ❌ Never called                                   |
| `pruneMessages`                                                                                      | `src/chat/pruning.ts`             | 250+  | ❌ 0 tests  | ❌ Never called                                   |
| `createTransition` / `detectTransitionType` / `isTransitionMessage`                                  | `src/chat/transitions.ts`         | 150+  | ❌ 0 tests  | ❌ Never called                                   |
| `generateRuleName` / `buildRenamePrompt`                                                             | `src/chat/auto-rename.ts`         | 100+  | ❌ 0 tests  | ❌ Never called → ✅ wired 2026-08 |
| `detectHallucinations`                                                                               | `src/chat/hallucination-guard.ts` | 200+  | ❌ 0 tests  | ❌ Never called                                   |

Current flow (what IS wired): user posts message → `routes/messages.ts` → `triggerAutoGeneration()` → provider resolution → `PromptAssembler.assemble()` → LLM. Group chat cascades via `selectNextGroupActor()` → `TurnManager.selectNextActor()`. Story mode falls through to the same path — **GameMasterService NOT used**. Memory extraction (`extractAndStoreMemories()`) is wired correctly.

Priority order: chat > memories > characters > assistant > NSFW.

## Tasks

### 1.1 Wire GameMasterService into story mode generation

- **Problem:** `GameMasterService` is fully tested but never called. Story mode uses the same `triggerAutoGeneration()` path as direct/group chat.
- **Fix:** In `generation/auto-gen.ts`, when `chat.type === "story"`, use `GameMasterService.executeTurn()` + `acceptResponse()` instead of direct LLM call.
- **Tests needed:** Integration test for story mode generation path.

#### 1.2 Fix turn number double-count

- **Problem:** `selectNextActor()` increments `currentTurn`, then `executeTurn()` adds 1 again (`TurnManager.selectNextActor()` increments BEFORE selecting; `executeTurn()` uses `+1`).
- **Fix:** Either remove the increment from `selectNextActor()` or remove the `+1` from `executeTurn()`.
- **Tests needed:** Update existing turn-manager tests.

#### 1.3 Wire chat service functions into routes

- **Problem:** `getChatContext`, `getFeatureFlags`, `getResponseLength` from `chat/service.ts` are never called.
- **Fix:** Use these in `routes/chat-context.ts` and `routes/messages.ts` instead of inline logic.

#### 1.4 Wire memory injection into generation pipeline

- **Problem:** `injectChatMemories()` is never called — memories are extracted but never injected into context.
- **Fix:** Call `injectChatMemories()` in `PromptAssembler.assemble()` or in `triggerAutoGeneration()` before prompt assembly.

#### 1.5 Wire context pruning

- **Problem:** `pruneMessages()` is never called — context windows grow unbounded.
- **Fix:** Call `pruneMessages()` in `PromptAssembler.assemble()` when context exceeds threshold.

#### 1.6 Wire auto-rename ✅

- **Status:** Done — wired in messages.ts, auto-renames "New Chat" on first message.

#### 1.7 Wire transitions

- **Problem:** `detectTransitionType()` and `createTransition()` are never called.
- **Fix:** Call in message route when user message matches transition patterns.

## Dependencies

- Parent hub: `TASK-reconciliation-plan.md` (analysis findings)
- Siblings: TASK-recon-security-fixes, TASK-recon-test-coverage (chat-module tests complement these fixes), TASK-recon-dedup (overlaps on `chat/service.ts` consolidation — coordinate 1.3 with dedup).

## Acceptance Criteria

- [ ] Story mode generation routes through `GameMasterService`
- [ ] Turn numbers no longer double-count
- [ ] Memory injection + pruning active in prompt assembly
- [ ] Transitions fire from the message route
- [ ] New/updated tests green
