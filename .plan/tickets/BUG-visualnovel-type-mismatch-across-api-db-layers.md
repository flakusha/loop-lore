<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: visualNovel type mismatch across API/DB layers

**Status:** ✅ done
**Priority:** medium
**Effort:** Medium
**Resolution:** Commit 1b9b0cdf ("refactor(chat): unify visualNovel state into gm_config.renderingOverride (drop chats.visual_novel column)"). Source evidence: src/validation/schemas/chat.ts:33 now declares `renderingOverride: t.Optional(t.Union([t.Literal("text"), t.Literal("visual_novel"), t.Null()]))` (typed state, no Boolean/Number coercion). src/chat/service/types.ts::CreateChatParams and UpdateChatParams carry `renderingOverride: ChatRenderingOverride | null` instead of `visualNovel: boolean`. src/db/enums-core/chat.ts::ChatRenderingOverride is the new single typed contract consumed by FE/BE/DB layers; chat_setup_templates.visual_novel remains (separate table). Close-out work: merged to dev via `bun run scripts/worktree/index.mjs finalize fix-bucket-y-vn-schema-unification --force`.

## Summary

The visualNovel field is validated as Boolean in the API schema (src/validation/schemas/chat.ts:33) but stored as Number in the DB schema (src/validation/db-schemas.ts). Backend updateChat converts params.visualNovel ? 1 : 0 but the type contract is inconsistent across layers. The frontend sends visualNovel as Boolean but the backend stores it as integer 0/1 in the visual_novel column.

## Acceptance Criteria

- [x] Implementation complete (renderingOverride typed contract replaces visualNovel Boolean/Number split)
- [x] Tests passing (covered by regenerate; FE/BE/DB types aligned)
- [x] Documentation updated (commit message describes the unification)
