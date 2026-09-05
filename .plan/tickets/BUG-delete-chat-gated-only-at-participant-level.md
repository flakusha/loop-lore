<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: DELETE chat gated only at participant level

**Status:** ✅ Resolved (already on dev, 2026-09-05)
**Priority:** high
**Effort:** Small

## Summary

src/routes/chats/manage.ts:183-198 uses checkChatAccess (any participant can delete the chat + cascade) while settings mutations use checkChatSettingsAccess (creator/Owner-role only, access.ts:125-165; batch.ts scopes to created_by). Fix: stricter tier for delete.

## Resolution

Already fixed in dev by `c95f2aec` (`fix(authz): harden generation control plane, shadow/whitenote, chat/entity/message authz`). Verified 2026-09-05 against current `dev` (`9b8c0222`):

- `src/routes/chats/manage.ts:183-186` — DELETE `/chats/:id` now uses `checkChatSettingsAccess` (creator/Owner-role tier), not `checkChatAccess`.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
