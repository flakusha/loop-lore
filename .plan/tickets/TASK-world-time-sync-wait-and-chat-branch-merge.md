<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: World Time Sync Wait And Chat Branch Merge

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-conversation-branching
**Tags:** time-sync, branch, merge

**Summary:**
World-time sync: actors travelling to a location must "wait" for others to finish their actions before merging into the same/merged chat. Multiple branches can then combine in one chat; replay is prohibited to simplify merging.

**Context:**
Without time-sync, two parties arriving within minutes could create duplicate chats at the same location. With sync, a party arriving earlier waits for stragglers (bounded by `wait_threshold_game_hours`); on sync, branches merge.

**Acceptance Criteria:**
- Read world-tick; on chat creation, check `parties_arriving_within(threshold)` and merge them into a single chat per `TASK-party-chat-branch-merge-on-converge`.
- Wait policy: arriving party enters `WAI-ARRIVAL-pending` until either threshold elapses or a counter-party arrives.
- Branch-merge from `epic-conversation-branching` invoked.
- Tests: two parties converge into single chat; one party times out and starts new chat.
