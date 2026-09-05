<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: any chat participant can hard-delete any message

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

src/routes/messages/update.ts:35-74 DELETE ?hard=true gated only by checkChatAccess (line 51) -> participant wipes another's row irreversibly; soft path sets hidden_by, edits correctly author-gated (:101-107). Fix: owner/author/admin gate for hard path.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
