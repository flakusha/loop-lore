<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Admin chat PATCH accepts arbitrary string for is_pinned

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

The is_pinned field (src/routes/admin/chats.ts:125-127) is validated as t.Optional(t.String()) in AdminChatUpdateBody (src/validation/schemas/admin.ts:45) and the handler passes it directly to the DB without enum validation. The application logic expects specific values: pinned, unpinned, archived. Impact: A client can set is_pinned to any arbitrary string (e.g. bogus), causing the chat to disappear from all listings and breaking archive/unarchive workflows. Fix: Validate is_pinned against the PinnedState enum before writing; return 400 on invalid value.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
