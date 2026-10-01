<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Gate branches display invariant + item instance state

**Status:** Not Started
**Priority:** medium
**Effort:** Small (two guards + tests)
**Epic:** epic-rpg-mechanics.md
**Summary:** `chat_branches.is_active` × `chats.active_branch_id` (migration `014`): the displayed branch must be the active one — enforce in `src/chat/service/branches.ts`. `world_items` instance (migration `016:19-27`: stackable/category × durability-NULL × is_active): add `ItemInstanceState` guard + test. No column changes.
**Context:** DB schema-gate audit (2026-09-25, db-migration-fixes session). Both invariants live only in migration comments today; runtime can violate them silently.

**Acceptance Criteria:**
- [ ] Branch display path rejects/repairs a mismatch between displayed branch and `active_branch_id`.
- [ ] `ItemInstanceState` guard validates stackable/category/durability/is_active combination for item instances.
- [ ] Unit tests cover both guards including violation cases.
- [ ] `bun run check` green.

**Tags:** db, chat-branches, world-items, invariants
**Related:** src/chat/service/branches.ts, src/db migration 014, src/db migration 016


git issue: c9a117d
