<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: generation control-plane routes lack authorization

**Status:** ✅ Resolved (already on dev, 2026-09-05)
**Priority:** critical
**Effort:** Large
**Epic:** epic-auth-permissions

## Summary

src/generation/controller.ts:66-115 registers generate/cancel/status/stream/active/retry/continue/regenerate/image/caption/test-connection; handlers pass/carry no userId+role and perform no chat access: handleGenerate (generate-route/handler.ts) writes into any chatId as any actor; cancel.ts:46-89 kills any chat's generation; status.ts:19-46, stream.ts:20-111, continue.ts:43-101 leak state/content cross-user; active.ts:17-23 lists all active; image-gen-route.ts:38-147 links assets into any chat; test-connection.ts:30-60 unauthz probe. Fix: requireUserId + checkChatAccess/checkChatSettingsAccess per route; regression tests.

## Resolution

Already fixed in dev by `c95f2aec` (`fix(authz): harden generation control plane, shadow/whitenote, chat/entity/message authz`). Verified 2026-09-05 against current `dev` (`9b8c0222`); `bun run typecheck` `EXIT=0`:

- `src/generation/generate-route/handler.ts:66-78` — `requireUserId` + `checkChatAccess` before prompt assembly/provider call.
- `src/generation/generation-routes/cancel.ts:98-103` — chat access gate; attemptId-only cancels resolved to chat then gated.
- `src/generation/generation-routes/status.ts:41-47` — chat access gate.
- `src/generation/generation-routes/stream.ts:44-52` — chat access gate before SSE open.
- `src/generation/generation-routes/retry.ts:80-85` + `continue.ts:72-77` + `regenerate.ts:79-85` — chat access gates.
- `src/generation/generation-routes/active.ts:24-33` — `requireUserId` + `can(userRole, "admin.system")` (global listing is admin-only).
- `src/generation/image-gen-route.ts:38-49` + `caption-route.ts:55-64` — `checkChatAccess` when scoped to a chat.
- `src/generation/generation-routes/test-connection.ts:26-30` — `requireUserId` (authenticated-only probe).

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
