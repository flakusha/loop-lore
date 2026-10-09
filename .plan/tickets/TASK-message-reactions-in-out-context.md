<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: In-context / out-of-context message reactions

**Effort:** Medium
**Summary:** One reaction store serving in-bubble chips and out-of-context affordances (quotes/replies/notification jumps), with optimistic add/remove and rollback.
**Context:** In-context shipped: chips + picker popover in `src/components/chat/message-list.html`, optimistic `toggleReaction` with rollback + `chats.reactionFailed` toast, picker hydrated from `GET quick-emojis`. Endpoints are reused (`POST` toggle / `DELETE`), not duplicated. Left: out-of-context affordance wired to the same store, seen-state interplay.
**Acceptance Criteria:** React from bubble and from a quoted reply converges to same count; failed request rolls back the optimistic chip + toast.

**Epic:** epic-frontend-emoji-reactions
**See also:** epic-messages.md, epic-message-seen-state.md
**Status:** Done

**Progress:** `toggleReaction` optimistic react/unreact shipped (`src/frontend/alpine/chat-messages.ts`, `src/routes/message-reactions.ts`); kept untouched — no full re-render, rollback toast on failure.
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
