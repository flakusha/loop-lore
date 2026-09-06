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

Stale on dev — already addressed by VN cycle 2 refactor (commit `1b9b0cdf` refactor(chat): unify visualNovel state into gm_config.renderingOverride, plus `017_drop_template_visual_novel.ts` which drops the template `visual_novel` column with backfill). `renderingOverride` is the typed enum source of truth, read inline via `gm_config.renderingOverride === "visual_novel"` in `src/chat/service/party.ts:172,221` (corrected 2026-09-06: no `chatIsVisualNovel` helper exists; the cited `party.ts:129-133` was stale). `KEY_MECHANIC_PARAMS` (`src/chat/service/access.ts:37-44`) no longer lists `visualNovel`; it sits in mutable `GM_CONFIG_PRESENTATION_KEYS` (`src/chat/service/access.ts:52-66`). (Corrected 2026-09-06: no `chats.visual_novel` column ever existed — `006_chat.ts:125` added it to `chat_setup_templates` only.)

