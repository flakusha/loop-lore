<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: generation control-plane routes lack authorization

**Status:** ⬜ Not Started
**Priority:** critical
**Effort:** Large
**Epic:** epic-auth-permissions

## Summary

src/generation/controller.ts:66-115 registers generate/cancel/status/stream/active/retry/continue/regenerate/image/caption/test-connection; handlers pass/carry no userId+role and perform no chat access: handleGenerate (generate-route/handler.ts) writes into any chatId as any actor; cancel.ts:46-89 kills any chat's generation; status.ts:19-46, stream.ts:20-111, continue.ts:43-101 leak state/content cross-user; active.ts:17-23 lists all active; image-gen-route.ts:38-147 links assets into any chat; test-connection.ts:30-60 unauthz probe. Fix: requireUserId + checkChatAccess/checkChatSettingsAccess per route; regression tests.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
