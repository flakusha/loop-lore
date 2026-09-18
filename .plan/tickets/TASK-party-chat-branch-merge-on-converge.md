<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Party Chat Branch Merge On Converge

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-party-migration
**Tags:** party, chat, branch-merge

**Summary:**
When two or more parties converge at the same location at roughly the same time, their chat branches merge into a single in-progress chat with merged timeline.

**Context:**
Players may run parallel branches ("what if I went north vs south"). When they reconcile at the same location, the branches should merge. This is an extension of `epic-conversation-branching` merge action.

**Acceptance Criteria:**
- New endpoint `POST /api/chats/branches/merge` body `{ chatIds: string[], mode: "converge" }` (admin or auto on `party:converge`).
- Merge logic: append messages from each chat in timestamp order, dedupe by `messageId`, mark merged branches.
- New state `branch.merged` on the chat row.
- Backed by `epic-time-scale` for game-time ordering.
- Tests: converge two branches produces a clean ordered chat.
