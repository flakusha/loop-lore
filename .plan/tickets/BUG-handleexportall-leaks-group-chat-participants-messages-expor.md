<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: handleExportAll leaks group-chat participants messages - exports all messages in chats created_by caller, ignoring participant membership

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

**Summary:** handleExportAll() in src/routes/settings.ts:88 selects all chats where created_by = caller then exports ALL messages in those chats. In group chats, this leaks other participants messages.

**Where:** src/routes/settings.ts:88

**Defect:** A user calling export-all on their account will receive private messages they never saw in group chats they created. The query selects chats by created_by but the message query joins on chat_id without filtering by author = caller. Result: cross-participant message body exposure.

**Fix sketch:** Either (a) restrict export to chats the caller is sole participant, or (b) when exporting group chats, restrict messages to rows where author_id = caller. Also scope chats to participant membership on the user side.

**Acceptance:** A test where user A creates a 3-person group, user B writes a message, user A exports all - current code includes Bs message; fixed code excludes it.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
