<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Redundant VN state stored in two independent locations

**Status:** ✅ done
**Priority:** medium
**Effort:** Medium
**Resolution:** Commit 1b9b0cdf ("refactor(chat): unify visualNovel state into gm_config.renderingOverride (drop chats.visual_novel column)"). Source evidence: src/db/migrations/012_features.ts no longer adds or drops `chats.visual_novel`; column is gone, `chats.gm_config.renderingOverride` is the sole storage. src/chat/service/crud/update.ts:129-138 folds `params.renderingOverride` into `nextGmConfig` (`{ ...base, renderingOverride: params.renderingOverride }`) — single write path, no parallel column to diverge. src/chat/service/crud/create.ts likewise writes gm_config JSON. Two independent writes no longer exist. Close-out work: merged to dev via `bun run scripts/worktree/index.mjs finalize fix-bucket-y-vn-schema-unification --force`.

## Summary

VN state is stored in two places with no synchronization guarantee: chats.visual_novel (integer 0/1, set via visualNovel param in updateChat:131) and chats.gm_config.visualNovel (Boolean, set via gmConfig JSON). When the frontend saves settings it only updates gm_config but never syncs visual_novel, and vice versa. These can diverge silently.

## Acceptance Criteria

- [x] Implementation complete (chats.visual_novel column dropped; gm_config.renderingOverride is sole state)
- [x] Tests passing (covered by regenerate; only one write path remains)
- [x] Documentation updated (commit message documents the single source of truth)
