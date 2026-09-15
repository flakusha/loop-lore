<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Browser-side chat input versioning with transparent rollback

**Status:** ✅ Done
**Epic:** epic-conversation-branching
**Priority:** medium
**Effort:** Medium

## Summary

Persist versions of the chat input on the browser side so typed text survives: leaving the field, pressing ESC, or hitting a blocked Enter must keep the draft transparently for both the frontend state and rollback. Provide explicit rollback affordances: Ctrl+Z and a dedicated restore button. Frontend chat-management follow-up from chat-turning-bugfix-batch-9. Scope: web UI input component (htmx/Alpine), local draft store (in-memory + localStorage for reload survival). Out of scope: server-side drafts. Acceptance: ESC / blocked-Enter / navigation never loses typed text; Ctrl+Z and the button each restore the prior input version.

## Acceptance Criteria

- [x] Implementation complete — ESC flushes debounced draft (`chat-group.ts:handleComposerKeydown`); blocked-Enter restores via `chat-send.ts:restoreInput()`; navigation flushes via `world.ts:selectChat`; Ctrl+Z restores from `_draftBackup`; restore button in `input-area.html`
- [x] Tests passing — 16 draft tests + 18 chat-group tests + 29 send/improve tests + 39 dispatch tests all green; frontend typecheck clean
- [x] Documentation updated — this ticket reflects implementation status
