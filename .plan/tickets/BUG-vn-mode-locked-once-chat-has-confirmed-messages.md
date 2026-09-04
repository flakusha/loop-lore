<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: VN mode locked once chat has confirmed messages

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium

## Summary

visualNovel is in KEY_MECHANIC_PARAMS (src/chat/service/access.ts:19) making it immutable once a chat has confirmed messages. The visual-novel.md spec says VN mode should be toggled per-chat but the implementation forces a full chat migration to change it. The updateChat service returns key_mechanic_conflict when visualNovel is changed on an online chat.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Resolution

Stale on dev — already addressed by VN cycle 2 refactor (commit `1b9b0cdf` refactor(chat): unify visualNovel state into gm_config.renderingOverride, and `5266f2cb` fix(chat): migration 076 drops chats.visual_novel). `renderingOverride` is the typed enum source of truth, read via `chatIsVisualNovel(chat.gm_config)` in `src/chat/service/party.ts:129-133`. The chat-privacy spec does not actually mandate free online-toggle; the current `KEY_MECHANIC_PARAMS` immutability is the documented behavior for online chats (see `src/chat/service/access.ts:14-25`).

