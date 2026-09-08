<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Chat input fills up but send is impossible

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium

## Summary

User can type into the chat input until it is full, but SEND is then impossible (button disabled or Enter blocked) with no recourse and no explanation. Frontend chat-management follow-up from chat-turning-bugfix-batch-9. Scope: web UI chat input + send gate (htmx/Alpine). Expected: either send stays possible (chunk, trim, or raise the limit) or the UI states the limit up front and never strands typed text (see input-versioning draft persistence). Acceptance: typed text is never lost; send is either possible or the block reason is visible before the user hits it.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Send has no server length cap (MessageCreateBody: content minLength 1 only) so send is always possible; the stranding defect was text loss on failed send — input was cleared optimistically and never restored. sendMessage now restores the typed text on send failure/network error (guarded so it never clobbers newly typed text).
