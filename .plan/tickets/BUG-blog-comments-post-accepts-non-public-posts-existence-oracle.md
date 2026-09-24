<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Blog comments POST accepts non-public posts (existence oracle via getPost raw lookup)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

**Summary:** `POST /api/blog/posts/:id/comments` passes a raw `getPost()` existence check, so any authed user gets a 404-vs-200 existence oracle for non-public posts and can comment on them.
**Context:** `src/routes/blog/comments.ts:27` — follow-up from the BUG-blog-post-get-bypasses-visibility-policy fix in worktree src-audit-2026-09-24.
**Acceptance Criteria:** comments POST applies the same visibility gate as GET /api/blog/posts/:id (public+published OR author OR admin; 404 on denial); the related list-route `?visibility=` passthrough (client-controlled filter reaching `listPosts`) is audited and gated in the same change.

## Summary

Follow-up from fixing BUG-blog-post-get-bypasses-visibility-policy (worktree src-audit-2026-09-24). src/routes/blog/comments.ts:27 POST /comments calls svc.getPost(ctx.params.id) raw for existence: any AUTHENTICATED user can (a) use 404-vs-200 as an existence oracle for private/draft posts, and (b) comment on non-public posts. Fix direction: fetch via the same visibility gate as GET /api/blog/posts/:id (public+published OR author OR admin; 404 on denial). Related advisory also from the same pass: GET /api/blog/posts list route forwards client-controlled ?visibility= to listPosts, allowing an authed user to list another author's private posts — audit and gate listPosts filters as part of the same change.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
