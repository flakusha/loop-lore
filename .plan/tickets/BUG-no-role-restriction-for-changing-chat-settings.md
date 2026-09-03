<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: No role restriction for changing chat settings

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

checkChatAccess() only checks admin.chat, creator, or participant (src/chat/service/access.ts:54). The chat-privacy.md spec requires Master or GM role for changing settings. Any participant can modify visualNovel, gmConfig, mode, turnStrategy, etc. The PUT /api/v1/chats/:id route does not enforce role-based permission for key mechanic changes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
