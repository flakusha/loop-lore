<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: chat reunite: secondary chat narrates 'archived' but is never archived

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** (see ## Summary)
**Context:** (see ## Observed / ## Evidence)
**Acceptance Criteria:** (see ## Acceptance Criteria)

## Summary

## Observed

reuniteChats injects a narration at lines 189-193 saying 'This branch is now archived' into the secondary chat, but performs no archive operation (no archiveChat call, no is_pinned update). The secondary chat remains fully accessible post-reunion — both chats are active and receiving messages.

## Expected

After reunion, the secondary chat's is_pinned should be 'archived' (or equivalent) so the narration matches reality and the secondary is hidden from the active chat list.

## Evidence

- src/chat/service/split.ts:189-193 — injectNarration call with 'This branch is now archived' message.
- src/chat/service/crud/archive.ts — archiveChat function exists and is the canonical archive entry point.
- reproduction: split a chat into two branches, reunite. Both chats remain in the user's chat list. New messages can be sent to the secondary chat, defeating the reunion.

## Severity

medium

## Fix direction

After the narration, call `archiveChat(database, secondaryChatId, actorId, userRole)` from `./chats` (or update is_pinned directly). Make the archived state match the narration.


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
