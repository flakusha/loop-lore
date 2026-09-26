<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Blog Frontend Authoring

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 🟡 Partial (reader + authoring UI on `blog-frontend-left-menu`, unmerged)
**Priority:** P1
**Effort:** High
**Epic:** epic-frontend-backend-integration
**Tags:** blog, frontend, authoring, posts, comments

## Summary

Create blog authoring and reader UI. Backend routes exist at `/api/blog/*` (posts, comments, follow, sources) including threaded comments and single-comment endpoint. Reader + authoring UI landed on branch `blog-frontend-left-menu`: `src/views/blog.html` (list, search/tag filter, create form, detail with threaded comments, follow toggle, RAG sources) linked into the left sidebar (`nav-blog`), `src/frontend/alpine/blog.ts` + `blog-types.ts` store (search, follow/unfollow/status, sources, envelope-tolerant parsing), `src/frontend/pages/blog.ts` (`blogPage()` component). Open: WYSIWYG rich-text editor (plain-markdown form only), draft management, category filtering, moderation/follower-management UI.

## Backend Routes (already exist)

| Route                                   | Method | Purpose             |
| --------------------------------------- | ------ | ------------------- |
| `/api/blog/posts`                       | GET    | List posts          |
| `/api/blog/posts/:id`                   | GET    | Get post            |
| `/api/blog/posts`                       | POST   | Create post         |
| `/api/blog/posts/:id`                   | PATCH  | Update post         |
| `/api/blog/posts/:id`                   | DELETE | Delete post         |
| `/api/blog/posts/:id/comments`          | GET    | List comments (threaded) |
| `/api/blog/posts/:id/comments/:commentId` | GET  | Get single comment with children |
| `/api/blog/posts/:id/comments`          | POST   | Add comment (with parent_comment_id) |
| `/api/blog/follow/:authorId`            | POST   | Follow author       |
| `/api/blog/follow/:authorId`            | DELETE | Unfollow author     |
| `/api/blog/follow/:authorId/status`     | GET    | Check follow status |
| `/api/blog/authors/:authorId/followers` | GET    | List followers      |
| `/api/blog/posts/:id/sources`           | GET    | RAG sources         |

## Frontend Files Created

- `src/frontend/alpine/blog.ts` + `blog-types.ts` — Alpine.js blog store (loadPosts, loadPost, createPost, createComment, listComments, searchPosts/visiblePosts, followAuthor/unfollowAuthor/getFollowStatus, loadSources)
- `src/frontend/pages/blog.ts` — `blogPage()` Alpine component + `initBlogPage`
- `src/views/blog.html` — list, search/tag filter, inline create form, detail with threaded comments, follow toggle, RAG sources
- `src/views/layout.html` — left-sidebar `nav-blog` link (`/views/blog`)
- `src/public/locales/*.json` — `navigation.blog` + `blog.*` strings (10 locales)

## Acceptance Criteria

- [x] Blog Alpine store with `apiFetch` and `jsonBody`
- [x] Blog page module registered in `pages.ts`
- [x] Post list with search/filter
- [ ] Post creation with rich text editor (plain-markdown form landed; WYSIWYG open)
- [x] Post detail view with threaded comments
- [x] Comment submission with threading support
- [x] Follow/unfollow author
- [x] RAG sources display
- [ ] Draft management
- [x] Tag filtering (category filtering open)

## Related

- `epic-blog-system.md` — Blog epic
- `TASK-blog-system.md` — Existing task (updated: threading + visibility done)
- `BUG-blog-comments-lack-threading-parent-comment-id-blocking-lemm.md` — Resolved by `075_blog_comments_threading.ts` migration

## Verification 2026-09-26

Verdict: **still-open-expanded** (reader + plain-markdown authoring landed in-tree; the "unmerged branch" note is stale).

Src checked:
- `src/views/blog.html` — list + search/tag filter + inline create form + threaded detail + follow toggle + RAG sources, all present as the ticket describes.
- `src/frontend/alpine/blog.ts` (`loadPosts/loadPost/createPost/createComment/searchPosts/visiblePosts/followAuthor/unfollowAuthor/getFollowStatus/loadSources`, envelope-tolerant parsing) + `src/frontend/pages/blog.ts` (`blogPage()`, `initBlogPage`) + `layout.html` `nav-blog` link — all in-tree, so the "on `blog-frontend-left-menu`, unmerged" status is STALE; the work is merged.
- Store shape (`_blogPosts/_blogPost/_blogComments/_blogSources/_blogFilter/_blogTag/_blogFollowStatus`) confirms the gaps: no draft state, no WYSIWYG/rich-text (plain-markdown form only), no category filter (tag filter only), no follower-management UI.

Refreshed deltas:
- Check off: store with `apiFetch`+`jsonBody`, page registration, list/search/filter, detail + threading, comment submission, follow/unfollow, RAG sources, tag filtering.
- Still open, each a concrete UI slice: (a) WYSIWYG rich-text editor for post creation; (b) draft save/resume/management; (c) category filtering (beyond tags); (d) moderation/follower-management UI (backend `PATCH /moderate` exists, no UI calls it).
