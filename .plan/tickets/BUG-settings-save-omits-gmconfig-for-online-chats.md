<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Settings save omits gmConfig for online chats

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium

## Summary

Frontend chat-settings.ts saveChatSettings() only sends gmConfig when !this._chatOnline (line 163). Since visualNovel settings (layout, typewriter, transition, etc.) are part of gmConfig, they can never be changed for any chat with confirmed messages. The frontend reads these from gm_config but the save path is blocked for online chats.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed by `a16490a7` ("fix(chat): allow VN presentation gmConfig on online chats; expose full VN settings").

- `src/chat/service/access.ts` — split `GM_CONFIG_PRESENTATION_KEYS` from `KEY_MECHANIC_PARAMS`; online immutability guard inspects `gmConfig` sub-keys individually (presentation/display keys remain mutable; GM-execution keys stay immutable).
- `src/chat/service/crud/update.ts` — `updateChat` accepts presentation `gmConfig` sub-keys on online chats via `presentationGmConfig` merge; rejects only immutable GM-execution keys with `key_mechanic_conflict`.
- `src/frontend/alpine/chat-settings.ts` — `saveChatSettings()` always dispatches `gmConfig`; online chats send the presentation-only subset (`presentationGmConfig`), offline chats send the full blob. `_chatSettingsMode` defaults `"story"`, load fallback `?? "story"`.
- `src/frontend/alpine/chat-settings/gm-config.ts` — mirrors `GM_CONFIG_PRESENTATION_KEYS` client-side; `presentationGmConfig()` subsets the payload.
- `src/validation/schemas/chat.ts` + `primitives.ts` — schema accepts the presentation sub-keys.

Tests: `src/chat/service/crud/update.test.ts` (online gmConfig presentation save) + `src/frontend/alpine/chat-settings/gm-config.test.ts` (presentation subset) — both green.
