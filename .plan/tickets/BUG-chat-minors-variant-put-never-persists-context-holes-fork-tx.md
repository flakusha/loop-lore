<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Chat minors: variant PUT never persists, context holes, fork txn, purge FK

**Status:** Done
**Status Note:** [2026-10-28 triage refresh] Items 1, 3 and 4 are fixed; item 2 remains open. Items 1 and 3 fixed: variant PUT demoted to a stateless GET (src/routes/messages/read.ts:245-249) and fork now flips active_branch_id inside the transaction (src/chat/service/branch-fork.ts:132-136; caller branches.ts:97-101). Item 4 (the purge FK guard) is now fixed: `src/routes/messages/archiving.ts:150` runs a PRAGMA + `sqlite_master` structural-reference survey BEFORE the transaction opens and refuses to purge structurally-referenced rows (`433244f7c`, `77d7471a1`). Item 2 remains open: `src/chat/context-window.ts:87-117` still retains non-contiguous history after a non-fit message (context holes). Item 2 is outside the 2026-10-25 review's 26 findings, so it was not verified by that sweep and this ticket is not reopened on its account.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-context-optimization

**Summary:**

Four MINOR verified chat defects, one batch: (1) PUT /messages/:id/variant never writes - it only SELECTs siblings and returns one (src/routes/messages/read.ts:202-244); client swipe selection silently lost - persist it or demote to GET. (2) computeContextWindow retains non-contiguous history - skips an over-budget older message but keeps older ones (src/chat/context-window.ts:86-117) - break at first non-fit or document hole semantics. (3) forkBranch commits the demotion+insert transaction, then updates chats.active_branch_id as a separate non-transactional statement (src/chat/service/branch-fork.ts:109-127) - move it inside the transaction. (4) Purge bulk-deletes archived messages with no guard for structural references - parent_id / branch fork-point rows raise FK -> purge 500s, and asset_links entity rows are never cleaned (src/routes/messages/archiving.ts:120-125; FK enforcement ON at src/db/index.ts:36) - refuse/re-parent and clean asset_links in the same pass.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

PARTIAL. Fixed in worktree fix-fork-active-branch-desync - item (3) fork txn: the chats.active_branch_id update moved INSIDE the transaction (tree/fix-fork-active-branch-desync/src/chat/service/branch-fork.ts:126-133; dev still calls setActiveBranchId(db, ...) after insertForkRow's transaction at src/routes/chats/branches.ts:96-99). Still open on dev: (1) variant PUT never persists - src/routes/messages/read.ts:202-244 only SELECTs sibling variants and returns variants[body.variantIndex] (:229, :237), no UPDATE, no worktree touches read.ts; (2) context holes - src/chat/context-window.ts:86-95 phase 2 skips an over-budget older message but keeps iterating to older ones, phase 3 trim (:101-117) also drops middle messages; (4) purge FK guard - src/routes/messages/archiving.ts:120-124 bulk deleteFrom("messages") on archived rows with no parent_id/fork-point guard.

**Resolved:** 2026-10-26 registry-driven close: git issue 6f5e8fb (registry tip: 6ae18f6f3 Konstantin Fedotov Close issue)
