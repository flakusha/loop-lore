<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: updatePost has no ownership check — any authenticated user can edit any blog post by ID

**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Done (closed 2026-09-20) — author_id ownership check added
**Priority:** high
**Effort:** Small

## Summary

**Summary:** updatePost() in src/rpg/blog/service/posts.ts:183 updates blog_posts WHERE id = ? with no author_id check. Any authenticated caller can edit any post (IDOR).

**Where:** src/rpg/blog/service/posts.ts:183-218

**Defect:** The UPDATE statement is:

```

db.updateTable("blog_posts")

  .set(updates)
  .where("id", "=", id)
  .executeTakeFirst();

```

There is no verification that the requesting user's id matches post.author_id. Any caller with a valid session can rewrite any blog post (title, body, visibility, status, metadata).

**Fix sketch:** Either add author_id to the WHERE clause (returns 0 rows when caller is not author) or pre-fetch the post and 403/404 before update. Pass caller userId through the call chain (route → service).

**Acceptance:** A test where user A creates a post and user B calls updatePost(post.id, { title: 'hax' }) — current code mutates; fixed code returns undefined / 403.

## Resolution

src/rpg/blog/service/posts.ts: updatePost now takes (db, id, input, callerUserId, isAdmin); pre-fetches and returns undefined unless caller owns or is admin.

src/rpg/blog/service/posts.coverage.test.ts + service.test.ts: 6 new tests cover non-author rejection + admin override.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
