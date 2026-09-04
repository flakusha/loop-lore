<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: gm_config corrupted by string-spread in buildChatUpdates merge

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

PUT /api/v1/chats/:id with renderingOverride or gmConfig corrupts gm_config: fullChat.gm_config is TEXT, cast to Record and spread produces numeric-index garbage keys. Introduced in 1b9b0cdf merge logic; made reachable by a16490a7 (online VN presentation updates). Fix: safeJsonParse(fullChat.gm_config, {}) before spread in src/chat/service/crud/update.ts buildChatUpdates.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
