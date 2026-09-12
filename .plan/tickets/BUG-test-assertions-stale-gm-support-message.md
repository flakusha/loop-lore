<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: test-assertions-stale-gm-support-message

**Status:** [OK] Resolved
**Priority:** high
**Effort:** Trivial
**Epic:** epic-chat-lifecycle-moderation

## Summary

Two unit tests assert a stale error message from `checkChatSettingsAccess` (src/chat/service/access.ts:215):

- `src/chat/service/crud/archive.test.ts:105` — `archiveChat denies a non-owner member`
- `src/chat/service/visibility.test.ts:151` — `hardDeleteChat denies a non-owner member with a forbidden result`

Tests expected `"Only the chat creator or an Owner role can change settings"`. After GM support was added to `checkChatSettingsAccess` (the function now also accepts a participant with `role_in_chat = ChatParticipantRole.Gm`), the production message changed to `"Only the chat creator, an Owner, or a GM can change settings"`. Tests were not updated, so `bun test` reported 2 failures on dev that blocked the `bun run check` gate.

Both failing tests assert the **non-owner member denial path** — neither was exercising GM behaviour, just comparing the literal error string. The fix is one string update per test to match the current production message.

## Acceptance Criteria

- [x] Implementation complete (test message strings updated to match src/chat/service/access.ts:215)
- [x] Tests passing (`bun test src/chat/service/visibility.test.ts src/chat/service/crud/archive.test.ts` → 12 pass, 0 fail)
- [x] Documentation updated (this ticket)
