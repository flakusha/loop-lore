<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: In-context / out-of-context message reactions

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-frontend-emoji-reactions.md
**See also:** epic-messages.md, epic-message-seen-state.md
**Status:** Open
**Priority:** Medium

## Scope

- Reaction bar on message bubble (in-context) + reaction affordance on
  quotes/replies/notification jumps (out-of-context); one Alpine store,
  optimistic add/remove with rollback on 4xx/5xx.
- Endpoints reused, not duplicated: `POST/DELETE` reaction routes serve
  both contexts; out-of-context variant links back to source message id.
- Seen-state interplay: reacting marks seen per epic-message-seen-state.

## Acceptance

- React from bubble and from a quoted reply converges to same count.
- Failed request rolls back optimistically added reaction + toast.
