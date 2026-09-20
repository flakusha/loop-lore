<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: deletePost has no ownership check — any authenticated user can hard-delete any blog post by ID

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

**Summary:** deletePost() in src/rpg/blog/service/posts.ts:228 deletes blog_posts WHERE id = ? with no author_id check. Any authenticated caller can hard-delete any post.

**Where:** src/rpg/blog/service/posts.ts:228-235

**Defect:** Hard delete with no authorization:
```
db.deleteFrom("blog_posts")
  .where("id", "=", id)
  .executeTakeFirst();
```

**Fix sketch:** Pre-fetch post by id, verify post.author_id matches caller's userId (or caller is admin), then delete. Return false on ownership failure. Pass caller userId through call chain.

**Acceptance:** A test where user A creates a post and user B calls deletePost(post.id) — current code returns true; fixed code returns false.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
