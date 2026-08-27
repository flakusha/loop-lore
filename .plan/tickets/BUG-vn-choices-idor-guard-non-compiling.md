<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: vn-choices IDOR guard does not compile (merge `3ab26ccd`)

**Status:** ✅ Resolved (fixed in worktree merge-review-followups, 2026-08-27)
**Priority:** critical
**Effort:** Small

## Summary

The IDOR fix for `src/routes/chats/vn-choices.ts` (merged via `3ab26ccd`,
constituent `61ef179c`) references `chatId` which was deleted when the merge
replaced `const chatId = ctx.params.id` with the guard, and reads the wrong
`checkChatAccess` result shape:

- `src/routes/chats/vn-choices.ts:45,59,81,95` — `chatId` is not declared
  (TS2304 "Cannot find name 'chatId'"; TS18004 "No value exists in scope").
- `checkChatAccess` returns `{ ok: false, error: ServiceError }`, but the code
  reads `access.message` / `access.code` (TS2339). Both VN-choice endpoints
  (`handleListVnChoices`, `handleSelectVnChoice`) fail to compile, so the
  IDOR protection is **non-functional** — the route cannot load at all.

## Acceptance Criteria

- [ ] Restore the `chatId` binding (or derive it from the guard result).
- [ ] Read the correct `checkChatAccess` error field (`error`, not
      `message`/`code`).
- [ ] `bun run check` passes; route compiles.
- [ ] Re-add the cross-user read/select regression test from
      `BUG-chat-vn-choices-idor-cross-user-read-and-select.md`.

## Related

- `BUG-chat-vn-choices-idor-cross-user-read-and-select.md` (the underlying
  IDOR bug; its fix is currently non-compiling).
- `BUG-security-merge-build-break-instances-ts.md` (same broken merge).
