<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: DELETE chat gated only at participant level

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

src/routes/chats/manage.ts:183-198 uses checkChatAccess (any participant can delete the chat + cascade) while settings mutations use checkChatSettingsAccess (creator/Owner-role only, access.ts:125-165; batch.ts scopes to created_by). Fix: stricter tier for delete.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
