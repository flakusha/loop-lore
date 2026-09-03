<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: chat swipe_index race on concurrent assistant replies (reply.ts:83-84)

**Status:** Done
**Priority:** high
**Priority Tier:** P2
**Effort:** Small
**Area:** chat
**Source:** reconcile review (Scout Batch A — ISSUE-3)

## Evidence

`src/routes/messages/reply.ts:83-84` computes `swipe_index` as `(replySwipe?.max_idx ?? 0) + 1` without a DB lock.

## Impact

Two concurrent assistant replies on the same parent message read the same `max_idx`, claim the same `swipe_index`, and race on `INSERT`. Worst case: lost update or duplicate swipe.

## Fix

Add a unique index on `(chat_id, parent_id, swipe_index)` in `messages` migration and use `INSERT ... ON CONFLICT (chat_id, parent_id, swipe_index) DO UPDATE SET swipe_index = excluded.swipe_index + 1`. Alternatively use `selectForUpdate` semantics on the parent row before computing max.

## Verification

- Unit test: spawn two concurrent `maybeAutoReply` calls against the same parent → assert unique swipe_indexes.
- Re-run `tests/e2e/flows/messages-variants.test.ts` (swipe variants) end-to-end.

## Acceptance Criteria

- [x] Concurrent replies produce distinct swipe_indexes
- [x] Migration adds unique index (and `bun run db:sync-types && bun run db:sync-manifest`)
- [x] No `bun run check` regressions

## Resolution

Fixed in commit `08c2a95f` (chat swipe_index race): added unique constraint `(chat_id, parent_id, swipe_index)` via migration `058_swipe_index_unique.ts` and changed `src/routes/messages/reply.ts` to use `ON CONFLICT DO UPDATE`. Verified via `bun test src/routes/messages/`.