<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: moderateComment has no authorization — any caller can change any comment's status (IDOR/moderation bypass)

**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Resolved (already on dev, 2026-09-21)
**Priority:** high
**Effort:** Small

## Summary

**Summary:** moderateComment() in src/rpg/blog/service/comments.ts:148 updates blog_comments.status with no authorization check. Any caller can mark any comment hidden, visible, or deleted.

**Where:** src/rpg/blog/service/comments.ts:148-160

**Defect:** The UPDATE runs unconditionally:

```

db.updateTable("blog_comments")

  .set({ status, })
  .where("id", "=", id)
  .executeTakeFirst();

```

There is no check that the caller is the post's author, the comment's author, an admin, or has any moderator role. Attack: hide any user's comment, un-hide removed spam, or soft-delete content to suppress it.

**Fix sketch:** Resolve comment → post → author; verify caller is comment author OR post author OR has moderator/admin role before update. Return false on auth failure.

**Acceptance:** A test where a non-author, non-admin, non-mod caller attempts to moderate a comment they don't own — current code returns true; fixed code returns false.

## Resolution

Already fixed on dev by `05e00c2b0` (`fix(blog): moderateComment IDOR guard at service layer`).
Verified 2026-09-21 against dev HEAD `b85385c85`:

- `src/rpg/blog/service/comments.ts:148` — `moderateComment` now resolves comment → post → caller and returns `false` unless caller is comment author, post author, moderator, or admin.
- Acceptance test added (non-author, non-admin, non-mod caller attempting to moderate returns `false`).

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
