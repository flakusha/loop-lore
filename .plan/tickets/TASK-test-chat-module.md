<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add unit tests for chat module (15 files, 0 tests)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Large
**Epic:** epic-logic-reconciliation

## Summary

The `src/chat/` module has 15 source files and 0 test files. This is the core chat lifecycle module — context windows, memory injection, pruning, transitions, auto-rename, moderation, hallucination guard.

## Files to Test

| File                     | Lines | Key Functions                                                                                                |
| ------------------------ | ----- | ------------------------------------------------------------------------------------------------------------ |
| `service.ts`             | ~900  | `checkChatAccess`, `createChat`, `updateChat`, `deleteChat`, `getChatContext`, `listMessages`, `editMessage` |
| `context-window.ts`      | ~200  | `computeContextWindow`, `getThresholdState`, `injectMemories`, `injectEvents`                                |
| `memory-injection.ts`    | ~200  | `injectChatMemories`, `fetchActorMemories`, `injectMemoriesIntoContext`                                      |
| `memory-promotion.ts`    | ~250  | `promoteMessagesToMemory`, `classifyMessage`, `classifyImportance`                                           |
| `pruning.ts`             | ~250  | `scoreMessage`, `pruneMessages`                                                                              |
| `transitions.ts`         | ~150  | `isTransitionMessage`, `detectTransitionType`, `createTransition`, `selectMessagesForPromotion`              |
| `auto-rename.ts`         | ~100  | `generateRuleName`, `buildRenamePrompt`, `extractTopic`, `truncate`                                          |
| `moderation.ts`          | ~150  | `checkModerationPermission`, `createModerationAction`, `isBanned`, `isBlocked`, `getShadowState`             |
| `hallucination-guard.ts` | ~200  | `detectHallucinations`, `extractProperNouns`, `classifyEntity`, `loadKnownEntities`                          |
| `response-length.ts`     | ~50   | `resolveResponseLength`, `isValidPreset`                                                                     |
| `token-counter.ts`       | ~50   | Token counting utilities                                                                                     |
| `token-utils.ts`         | ~30   | `estimateTokens`                                                                                             |
| `random-events.ts`       | ~50   | Random event generation                                                                                      |
| `types.ts`               | ~200  | Type definitions, `resolveFeatureFlags`, `MODE_DEFAULTS`                                                     |

## Acceptance Criteria

- [ ] Each file has at least 1 test file
- [ ] Core functions covered (≥80% function coverage)
- [ ] All tests pass: `bun test src/chat/`

## Chat Audit 2026-08-25 — Cross-Reference

**Finding B6:** `Messages` entity (`src/chat/service/types.ts`, `src/db/schema-core.ts`) lacks first-class reaction/grading fields; assets linked via separate `asset_links` table, not embedded. Swipe hierarchy (`parent_id`/`swipe_index`) present.

_Source: chat functionality audit (loop-lore), 2026-08-25. Related umbrella ticket for asset-injection feature: TASK-show-assets-scenes-worlds-items-to-character-via-chat-contex (issue afe0589)._
