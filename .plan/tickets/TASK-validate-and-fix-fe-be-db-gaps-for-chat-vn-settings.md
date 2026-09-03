<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Validate and fix FE/BE/DB gaps for chat/VN settings

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Acceptance criteria: (1) visualNovel type consistent across API schema (Boolean) and DB schema (Number) — add conversion layer or unify type; (2) visualNovel removed from KEY_MECHANIC_PARAMS or allowed to change via explicit migration-free path; (3) saveChatSettings() sends gmConfig for online chats too, or add separate endpoint for VN settings; (4) checkChatAccess() requires Master/GM role for settings changes per chat-privacy.md; (5) eliminate redundant visual_novel column by using gm_config.visualNovel as single source of truth; (6) add missing VN fields (imageScaling, autoAdvanceDelay, dialogueBoxOpacity, portraitSize, splitRatio) to gm_config. Attached to epics: epic-assistant-gm-flows, epic-chat-lifecycle-moderation.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
