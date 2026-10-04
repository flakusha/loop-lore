<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Chat minors: variant PUT never persists, context holes, fork txn, purge FK

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Four MINOR verified chat defects, one batch: (1) PUT /messages/:id/variant never writes - it only SELECTs siblings and returns one (src/routes/messages/read.ts:202-244); client swipe selection silently lost - persist it or demote to GET. (2) computeContextWindow retains non-contiguous history - skips an over-budget older message but keeps older ones (src/chat/context-window.ts:86-117) - break at first non-fit or document hole semantics. (3) forkBranch commits the demotion+insert transaction, then updates chats.active_branch_id as a separate non-transactional statement (src/chat/service/branch-fork.ts:109-127) - move it inside the transaction. (4) Purge bulk-deletes archived messages with no guard for structural references - parent_id / branch fork-point rows raise FK -> purge 500s, and asset_links entity rows are never cleaned (src/routes/messages/archiving.ts:120-125; FK enforcement ON at src/db/index.ts:36) - refuse/re-parent and clean asset_links in the same pass.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
