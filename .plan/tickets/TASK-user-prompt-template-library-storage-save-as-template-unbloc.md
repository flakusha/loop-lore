<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: User prompt-template library storage (save-as-template unblock)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** high
**Effort:** Medium

## Summary

Deferred from prompt-power batch: /save-as-template needs a per-user prompt storage seam. Admin chat-setup templates are the wrong surface (admin-owned, future-chats-only binding). Decide: extend users.quick_replies-style JSON column vs new user_prompt_templates table, then implement save/list/insert commands. Blocks: /save-as-template slash command.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
