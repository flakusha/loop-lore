<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: No role restriction for changing chat settings

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium

## Summary

checkChatAccess() only checks admin.chat, creator, or participant (src/chat/service/access.ts:54). The chat-privacy.md spec requires Master or GM role for changing settings. Any participant can modify visualNovel, gmConfig, mode, turnStrategy, etc. The PUT /api/v1/chats/:id route does not enforce role-based permission for key mechanic changes.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed by `e14d3aaa` ("fix(chat): gate chat-settings mutations to creator/owner/admin (BUG-no-role-restriction)") + `a16490a7` ("fix(chat): allow VN presentation gmConfig on online chats; expose full VN settings").

- `src/chat/service/access.ts` — added `checkChatSettingsAccess()`: strict settings-mutation gate. Only admin (via `admin.chat` permission), chat creator, or participant with `role_in_chat = "owner"` (Master equivalent) may mutate settings. Members/observers/guests are denied even when they pass the broad `checkChatAccess`. Per `docs/spec/chat-privacy.md` §5.1.
- `src/routes/chats/manage.ts` — `PUT /api/v1/chats/:id` (and `/migrate`, `/rename`) gate on `checkChatSettingsAccess` instead of `checkChatAccess`; returns `403 forbidden` for unauthorized mutations.
- `src/chat/service/gm-guidance.ts` — `PUT /api/v1/chats/:id/gm-guidance` also gates on `checkChatSettingsAccess` (was `checkChatAccess`).
- `src/chat/service/index.ts` — barrel exports `checkChatSettingsAccess`.

Tests: `src/chat/service/access.test.ts` — `checkChatSettingsAccess` describes covering admin/creator/owner grant + member/observer/guest/stranger denial (7 cases, all green).
