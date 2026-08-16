<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire context pruning into prompt assembly

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-logic-reconciliation

## Summary

`pruneMessages()` in `src/chat/pruning.ts` is fully implemented (250+ lines, scoring + pruning algorithm) but never called. Context windows grow unbounded — no pruning or memory promotion occurs.

## Current State

- `ContextCompactor` in `generation/context-compactor.ts` is used as a fallback in `generate-route.ts` (line ~200)
- `pruneMessages()` in `chat/pruning.ts` is never called anywhere
- `promoteMessagesToMemory()` in `chat/memory-promotion.ts` is never called anywhere
- `ContextCompactor` does basic token-based trimming, not score-based pruning with memory promotion

## Fix

In `PromptAssembler.assemble()`:

1. After loading messages, call `pruneMessages()` with `DEFAULT_PRUNING_CONFIG`
2. For promoted messages, call `promoteMessagesToMemory()` to store them as long-term memories
3. Use pruned message list for prompt assembly

## Acceptance Criteria

- [ ] `pruneMessages()` is called during prompt assembly
- [ ] Promoted messages are stored via `promoteMessagesToMemory()`
- [ ] Pruned messages are removed from context but stored in memory
- [ ] Tests pass: `bun test src/chat/ src/generation/`
