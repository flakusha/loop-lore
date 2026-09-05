<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: shadow and whitenote CRUD open to any chat participant

**Status:** ⬜ Not Started
**Priority:** critical
**Effort:** Medium
**Epic:** epic-chat-lifecycle-moderation

## Summary

src/routes/gm-notes/shadow.ts:111,150,181,221 + whitenotes.ts:42,78,111 gate on checkChatAccess (admin|creator|any participant), not checkChatSettingsAccess used by gm-guidance (gm-guidance.ts:37-38). Members can read/reveal/delete hidden shadow notes (reveal writes player-visible narrator message, shadow.ts:194-207); docs/spec/gm-shadow-notes.md:83-88 + chat-privacy.md:198-199 say GM-only. Test gap: gm-notes.test.ts:91-99 covers only non-member 403. Fix: strict access tier; add member-vs-owner test.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
