<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Settings save omits gmConfig for online chats

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Frontend chat-settings.ts saveChatSettings() only sends gmConfig when !this._chatOnline (line 163). Since visualNovel settings (layout, typewriter, transition, etc.) are part of gmConfig, they can never be changed for any chat with confirmed messages. The frontend reads these from gm_config but the save path is blocked for online chats.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
