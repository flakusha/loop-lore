<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire memory injection into generation pipeline

**Status:** ✅ Done (closed via git issue)
**Priority:** High
**Effort:** Medium
**Epic:** epic-logic-reconciliation

## Summary

`injectChatMemories()` in `src/chat/memory-injection.ts` is fully implemented but never called. Memories are extracted after generation (`extractAndStoreMemories` in `generate-route.ts`) but never injected into the prompt context.

## Current State

- Memory extraction: ✅ wired in `generation/generate-route.ts` (line ~260)
- Memory injection: ❌ `injectChatMemories()` defined in `chat/memory-injection.ts`, exported from `chat/index.ts`, but never imported by any route or generation module
- `PromptAssembler.assemble()` does not call memory injection

## Fix

In `PromptAssembler.assemble()` (or in `triggerAutoGeneration()` before prompt assembly):

1. Fetch chat participants
2. Call `injectChatMemories()` with current context window, participants, and user message
3. Append injected memories to the prompt messages

## Acceptance Criteria

- [ ] `injectChatMemories()` is called during prompt assembly
- [ ] Injected memories appear in the prompt sent to LLM
- [ ] Token budget respects injected memories
- [ ] Tests pass: `bun test src/chat/ src/generation/`
