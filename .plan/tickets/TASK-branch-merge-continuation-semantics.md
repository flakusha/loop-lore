<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Branch-merge continuation semantics

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-conversation-branching
**Tags:** branch-merge

**Summary:** Confirm-time synthetic branch creation + active-pointer lockstep, and the continue path (prompt insert via `insertUserMessageRow` + `maybeAutoReply`) that resumes the conversation from the merged tip.
**Context:** Branch-merge design §3.2(c)(d) + §3.4: throw-to-rollback tx pattern `BranchTxAbort` (`src/chat/service/branch-fork.ts`); guarded status UPDATE precedent = `mergeBranch` numDeletedRows guard (`src/chat/service/branch-merge.ts:228-235`); lockstep demote/repoint `forkBranch` (`src/chat/service/branches.ts:96-99,142-158`); IDOR-guarded insert `insertUserMessageRow` (`src/routes/messages/insert-message.ts:47`); composer parents on the last loaded row (`src/frontend/alpine/chat-send.ts:46-47`); swipe-slot retry `src/utils/swipe-retry.ts`.
**Acceptance Criteria:** One confirm transaction writes result rows + synthetic branch + active pointer atomically; continue requires `confirmed` and resumes generation; regeneration-after-merge works through the existing variant path.
**Related:** FEAT-046.md, FEAT-047.md, FEAT-message-swipe-replay-branch.md

## Summary

Confirm — a single transaction (throw-to-rollback `MergeTxAbort`, the `BranchTxAbort` pattern):

1. Guarded transition `UPDATE branch_merges SET status='confirmed', confirmed_at=… WHERE id=? AND status='draft'` — zero updated rows → `conflict` (HTTP 409).
2. Insert result rows as children of `base_message_id` with `merge_id`, idempotency key `merge:<mergeId>:<ordinal>`, encrypted through `prepareContentStorage`, swipe-slot protected by `retryBounded`/`isSwipeIndexUniqueViolation`.
3. Create the synthetic `chat_branches` row rooted at the merged tip (`parent_message_id` = last result row id), name = `branchName ?? "Merged <n>"` (uniqueness via `uq_chat_branches_chat_name`).
4. When `activate` (default): demote the other `is_active=1` rows and set `chats.active_branch_id` — the same lockstep as `forkBranch`.
5. Emit the `message.merged` plugin event (registry pattern of `message.variant.created`, `src/chat/service/write.ts:157-169`).
6. Sources are NEVER deleted — only the display pointer moves.

Continue (`POST /api/v1/chats/:id/branch-merges/:mergeId/continue`, requires `status = "confirmed"`):

- With `prompt`: insert a user message parented on the merged tip through `insertUserMessageRow` (IDOR-guarded), then trigger auto-reply (`maybeAutoReply`).
- Without `prompt`: trigger an assistant continuation directly.
- After reload the composer already parents on the merged tip (`src/frontend/alpine/chat-send.ts:46-47`) — verify the interplay, no composer change expected.
- Regeneration after merge: merged rows are ordinary messages, so the existing `regenerateMessageVariant` sibling-swipe path applies unchanged; re-rolling a CONFIRMED merge = a new merge whose source is the prior merge's synthetic branch (merge of merges), a DRAFT merge re-rolls via `preview { regenerate: true }`.

## Acceptance Criteria

- [ ] Confirm runs as one transaction: guarded draft→confirmed transition (409 on zero rows), result-row insert, synthetic branch, pointer lockstep
- [ ] Result rows parent on `base_message_id`, carry `merge_id` + `merge:<mergeId>:<ordinal>`, and survive a concurrent sibling insert (swipe-race retry)
- [ ] Source branches remain intact after confirm; `message.merged` emitted
- [ ] Continue requires `confirmed`; with `prompt` it inserts via `insertUserMessageRow` and triggers `maybeAutoReply`
- [ ] Composer parents on the merged tip after reload; regeneration creates ordinary sibling swipes
