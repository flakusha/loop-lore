<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Context lossless/lossy tiering contract

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** context, token-budget, lossless, lossy, prompt
**Epic:** epic-chat-context-optimization

## Summary

Encode the epic's lossless/lossy tier contract (`epic-chat-context-optimization.md:47-57`) as a code rule in the prompt-assembly budget path: lossless tiers (recent chat history within `keepLast`, system/persona, location/world state, GM notes) are dropped last and never summarized; lossy tiers (memories, lore, events, history older than the window) are dropped first or summarized. Principle: never compress recent chat/location/events/system/GM notes; may compress memories/lore.

## Context

Grep-verified current state (no tier contract exists):

- Drop order is a bare `PRIORITY` rank table with no losslessness flag: `src/assistant/prompt/types.ts:185` (`PRIORITY`), enforced by `dropOverBudgetSections` in `src/assistant/prompt-budget.ts:61`, which only drops sections with rank `> 0`. `chatHistory` sits at rank 0 (immune) only by convention — nothing pins that.
- `ContextCompactor` hardcodes `threshold: 0.85, keepLast: 10` at both call sites (`src/generation/generate-route/build-prompt.ts:98`, `src/assistant/prompt-budget.ts:31`); the lossless window size is not configurable per mode.
- `pruneMessages` (`src/chat/pruning/prune.ts:86`) is wired only in the auto-gen path (`src/generation/auto-gen/context-pruning.ts:67`), never in the main `PromptAssembler` path (`TASK-wire-context-pruning.md`, still Not Started).
- `injectMemories`/`injectEvents` (`src/chat/context-window.ts:162,196`) have zero production callers — test-only (PATH B, per epic).
- Lossy-by-selection memory provisioning exists with a 1024-token default budget (`src/memory/provision.ts:63`) but is not labeled as the lossy tier.

## Acceptance Criteria

- [ ] Each `PRIORITY` section in `src/assistant/prompt/types.ts` carries an explicit lossless/lossy tier tag, and `dropOverBudgetSections` drops lossy tiers before lossless ones (lossless dropped last).
- [ ] Tests pin recent-chat-never-compressed: an over-budget assembly keeps `chatHistory` (lossless window) verbatim while `memories`/`lore`/`examples` drop first.
- [ ] `ContextCompactor` only summarizes history older than the lossless `keepLast` window; the last N messages are never summarized — covered by a keepLast-boundary test.
- [ ] Lossy memory tier (`provisionMemories`, default 1024-token budget) is documented as lossy-by-selection in code, with budget-exhaustion behavior tested.
- [ ] `bun test src/assistant/ src/generation/` passes, including the new tier tests.
