<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: shadow and whitenote CRUD open to any chat participant

**Status:** ✅ Resolved (already on dev, 2026-09-05)
**Priority:** critical
**Effort:** Medium
**Epic:** epic-chat-lifecycle-moderation

## Summary

src/routes/gm-notes/shadow.ts:111,150,181,221 + whitenotes.ts:42,78,111 gate on checkChatAccess (admin|creator|any participant), not checkChatSettingsAccess used by gm-guidance (gm-guidance.ts:37-38). Members can read/reveal/delete hidden shadow notes (reveal writes player-visible narrator message, shadow.ts:194-207); docs/spec/gm-shadow-notes.md:83-88 + chat-privacy.md:198-199 say GM-only. Test gap: gm-notes.test.ts:91-99 covers only non-member 403. Fix: strict access tier; add member-vs-owner test.

## Resolution

Already fixed in dev by `c95f2aec` (`fix(authz): harden generation control plane, shadow/whitenote, chat/entity/message authz`). Verified 2026-09-05 against current `dev` (`9b8c0222`):

- `src/routes/gm-notes/shadow.ts:37-39,50-51,71-72,91-92,113-115` — all four handlers (GET / POST / reveal / DELETE) now gate on `checkChatSettingsAccess` (creator/Owner-role tier), not `checkChatAccess`.
- `src/routes/gm-notes/whitenotes.ts:42,78,111` — same stricter tier applied.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
