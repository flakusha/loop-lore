<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Browser-side chat input versioning with transparent rollback

**Status:** ⬜ Not Started
**Epic:** epic-conversation-branching
**Priority:** medium
**Effort:** Medium

## Summary

Persist versions of the chat input on the browser side so typed text survives: leaving the field, pressing ESC, or hitting a blocked Enter must keep the draft transparently for both the frontend state and rollback. Provide explicit rollback affordances: Ctrl+Z and a dedicated restore button. Frontend chat-management follow-up from chat-turning-bugfix-batch-9. Scope: web UI input component (htmx/Alpine), local draft store (in-memory + localStorage for reload survival). Out of scope: server-side drafts. Acceptance: ESC / blocked-Enter / navigation never loses typed text; Ctrl+Z and the button each restore the prior input version.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
