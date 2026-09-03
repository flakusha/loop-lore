<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: VN mode locked once chat has confirmed messages

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

visualNovel is in KEY_MECHANIC_PARAMS (src/chat/service/access.ts:19) making it immutable once a chat has confirmed messages. The visual-novel.md spec says VN mode should be toggled per-chat but the implementation forces a full chat migration to change it. The updateChat service returns key_mechanic_conflict when visualNovel is changed on an online chat.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
