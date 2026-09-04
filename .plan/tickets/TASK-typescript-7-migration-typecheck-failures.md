<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TypeScript 7 migration — typecheck failures from incomplete visualNovel → renderingOverride migration

**Status:** ⬜ In Progress
**Priority:** high
**Effort:** Medium
**Labels:** bug, typescript7, migration, typecheck

## Summary

The project has `@typescript/native-preview@7.0.0-dev.20260707.2` installed. `tsgo` (the TS7 compiler) is configured as the typechecker via `bun run typecheck`. However, the `visualNovel: boolean` → `renderingOverride: ChatRenderingOverride | null` migration left 19 backend typecheck errors across 18 files. The frontend typecheck passes cleanly.

### Fresh worktree `tree/typescript7-migration` with fresh `node_modules` confirms:

- `bun run typecheck:frontend` — PASSES (0 errors)
- `bun run typecheck:backend` (`tsgo`) — 19 errors
- `bun run typecheck:coverage` — PASSES (97.04%)

### Error categories:

**A. `resolveFeatureFlags` does not exist** (1 error)
- `src/chat/types/index.ts:16` exports `resolveFeatureFlags` from `"./config"` but `config.ts` only has `resolveRendering`
- `src/chat/context-window.ts:22,68` imports and calls it
- `src/chat/types.test.ts` calls it

**B. `visualNovel` not in `CreateChatParams`/`UpdateChatParams`** (6 errors)
- `src/assistant/commands/create-entity.ts:110`, `src/generation/tools/create-location.ts:98`, `src/routes/chats/create.ts:189-190`, `src/routes/chats/manage.ts:108`, `src/routes/worlds/location-chat.ts:89`

**C. `visual_novel` in `InsertExpression<DB, "chats">`** (4 errors)
- `src/chat/service/split-utils.ts:53`, `src/chat/service/transitions.ts:91`, `src/chat/service/vn-choices.test.ts:36`, `src/generation/hooks/e2e-integration.test.ts:87`

**D. `visual_novel` in `SelectExpression<DB, "chats">`** (3 errors)
- `src/chat/service/party.ts:132,195`, `src/chat/service/split.ts:85`

**E. `gm_config` type mismatch + `visual_novel` on result type** (3 errors)
- `src/chat/service/crud/update.ts:130,134`, `src/routes/chats.test.ts:472`, `src/routes/worlds.test.ts:201`

### Previous tickets marked done but unverified:

- `BUG-visualnovel-type-mismatch-across-api-db-layers.md` — marked done without running typecheck
- `BUG-redundant-vn-state-stored-in-two-independent-locations.md` — same
- Closed based on commit `1b9b0cdf` without verifying the typecheck passes

## Acceptance Criteria

- [ ] `bun run typecheck` passes with 0 errors (backend, via `tsgo` / TS7)
- [ ] `bun run typecheck:frontend` passes (already verified)
- [ ] `bun run typecheck:coverage` ≥ 90% (already verified at 97.04%)
- [ ] `bun run check` full gate passes
- [ ] Existing tickets `BUG-visualnovel-type-mismatch-across-api-db-layers` and `BUG-redundant-vn-state-stored-in-two-independent-locations` updated with actual completion criteria
- [ ] Worktree `tree/fix-bucket-y-cascade` properly merged or cleaned up
- [ ] Worktree `tree/typescript7-migration` used for verification, then finalized

## Related

- `BUG-visualnovel-type-mismatch-across-api-db-layers` (incorrectly marked done)
- `BUG-redundant-vn-state-stored-in-two-independent-locations` (incorrectly marked done)
- `open-vn-settings-bugs.md` (umbrella ticket)
- `BUG-content-hooks-ts-missing-imports-breaks-typecheck.md` (separate, already resolved)
