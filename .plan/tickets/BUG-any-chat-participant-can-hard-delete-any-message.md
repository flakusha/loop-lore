<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: any chat participant can hard-delete any message

**Status:** ✅ Resolved (already on dev, 2026-09-05)
**Priority:** high
**Effort:** Small

## Summary

src/routes/messages/update.ts:35-74 DELETE ?hard=true gated only by checkChatAccess (line 51) -> participant wipes another's row irreversibly; soft path sets hidden_by, edits correctly author-gated (:101-107). Fix: owner/author/admin gate for hard path.

## Resolution

Already fixed in dev by `c95f2aec` (`fix(authz): harden generation control plane, shadow/whitenote, chat/entity/message authz`). Verified 2026-09-05 against current `dev` (`9b8c0222`):

- `src/routes/messages/update.ts:62-67` — hard-delete path now gates on `message.actor_id !== actorId && !can(userRole, "admin.chat")`; a member cannot wipe a row they did not write.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
